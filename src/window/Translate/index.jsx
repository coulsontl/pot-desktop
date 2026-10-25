import { readDir, BaseDirectory, readTextFile, exists } from '@tauri-apps/api/fs';
import { DragDropContext, Draggable, Droppable } from 'react-beautiful-dnd';
import { appWindow, currentMonitor, LogicalSize } from '@tauri-apps/api/window';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/tauri';
import { Spacer, Button } from '@nextui-org/react';
import { AiFillCloseCircle } from 'react-icons/ai';
import React, { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { BsPinFill } from 'react-icons/bs';

import LanguageArea from './components/LanguageArea';
import SourceArea from './components/SourceArea';
import TargetArea from './components/TargetArea';
import { osType } from '../../utils/env';
import { useConfig } from '../../hooks';
import { store } from '../../utils/store';
import { info } from 'tauri-plugin-log-api';

let blurTimeout = null;
let resizeTimeout = null;
let moveTimeout = null;

// Height floor matches TRANSLATE_MIN_HEIGHT in src-tauri/src/window.rs.
const TRANSLATE_MIN_HEIGHT = 306;
// Leave room for the taskbar so the window never grows past the usable screen.
const TRANSLATE_MAX_SCREEN_RATIO = 0.9;
// Toolbar row above the scroll container.
const TRANSLATE_HEADER_HEIGHT = 35;

// Total natural height of a container's children. Their margins are ignored:
// the layout uses <Spacer> elements, not margins, so there is nothing to add.
function sumChildrenHeight(element) {
    let total = 0;
    for (const child of element.children) {
        total += child.getBoundingClientRect().height;
    }
    return total;
}

const listenBlur = () => {
    return listen('tauri://blur', () => {
        if (appWindow.label === 'translate') {
            if (blurTimeout) {
                clearTimeout(blurTimeout);
            }
            info('Blur');
            // 100ms后关闭窗口，因为在 windows 下拖动窗口时会先切换成 blur 再立即切换成 focus
            // 如果直接关闭将导致窗口无法拖动
            blurTimeout = setTimeout(async () => {
                info('Confirm Blur');
                await appWindow.close();
            }, 100);
        }
    });
};

let unlisten = listenBlur();
// 取消 blur 监听
const unlistenBlur = () => {
    unlisten.then((f) => {
        f();
    });
};

// 监听 focus 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://focus', () => {
    info('Focus');
    if (blurTimeout) {
        info('Cancel Close');
        clearTimeout(blurTimeout);
    }
});
// 监听 move 事件取消 blurTimeout 时间之内的关闭窗口
void listen('tauri://move', () => {
    info('Move');
    if (blurTimeout) {
        info('Cancel Close');
        clearTimeout(blurTimeout);
    }
});

export default function Translate() {
    const [closeOnBlur] = useConfig('translate_close_on_blur', true);
    const [alwaysOnTop] = useConfig('translate_always_on_top', false);
    const [windowPosition] = useConfig('translate_window_position', 'mouse');
    const [rememberWindowSize] = useConfig('translate_remember_window_size', false);
    const [translateServiceInstanceList, setTranslateServiceInstanceList] = useConfig('translate_service_list', [
        'deepl',
        'bing',
        'lingva',
        'yandex',
        'google',
        'ecdict',
    ]);
    const [recognizeServiceInstanceList] = useConfig('recognize_service_list', ['system', 'tesseract']);
    const [ttsServiceInstanceList] = useConfig('tts_service_list', ['lingva_tts']);
    const [collectionServiceInstanceList] = useConfig('collection_service_list', []);
    const [hideLanguage] = useConfig('hide_language', false);
    const [pined, setPined] = useState(false);
    const [pluginList, setPluginList] = useState(null);
    const [serviceInstanceConfigMap, setServiceInstanceConfigMap] = useState(null);
    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };

    const onDragEnd = async (result) => {
        if (!result.destination) return;
        const items = reorder(translateServiceInstanceList, result.source.index, result.destination.index);
        setTranslateServiceInstanceList(items);
    };
    // 是否自动关闭窗口
    useEffect(() => {
        if (closeOnBlur !== null && !closeOnBlur) {
            unlistenBlur();
        }
    }, [closeOnBlur]);
    // 是否默认置顶
    useEffect(() => {
        if (alwaysOnTop !== null && alwaysOnTop) {
            appWindow.setAlwaysOnTop(true);
            unlistenBlur();
            setPined(true);
        }
    }, [alwaysOnTop]);
    // 保存窗口位置
    useEffect(() => {
        if (windowPosition !== null && windowPosition === 'pre_state') {
            const unlistenMove = listen('tauri://move', async () => {
                if (moveTimeout) {
                    clearTimeout(moveTimeout);
                }
                moveTimeout = setTimeout(async () => {
                    if (appWindow.label === 'translate') {
                        let position = await appWindow.outerPosition();
                        const monitor = await currentMonitor();
                        const factor = monitor.scaleFactor;
                        position = position.toLogical(factor);
                        await store.set('translate_window_position_x', parseInt(position.x));
                        await store.set('translate_window_position_y', parseInt(position.y));
                        await store.save();
                    }
                }, 100);
            });
            return () => {
                unlistenMove.then((f) => {
                    f();
                });
            };
        }
    }, [windowPosition]);
    // 保存窗口大小
    useEffect(() => {
        if (rememberWindowSize !== null && rememberWindowSize) {
            const unlistenResize = listen('tauri://resize', async () => {
                if (resizeTimeout) {
                    clearTimeout(resizeTimeout);
                }
                resizeTimeout = setTimeout(async () => {
                    if (appWindow.label === 'translate') {
                        let size = await appWindow.outerSize();
                        const monitor = await currentMonitor();
                        const factor = monitor.scaleFactor;
                        size = size.toLogical(factor);
                        // Height is driven by the content, so only the width is worth
                        // remembering; persisting the height would reopen the window at
                        // whatever the last translation happened to need.
                        await store.set('translate_window_width', parseInt(size.width));
                        await store.save();
                    }
                }, 100);
            });
            return () => {
                unlistenResize.then((f) => {
                    f();
                });
            };
        }
    }, [rememberWindowSize]);

    // Grow/shrink the window to fit its content, within [min, screen] bounds.
    // Depends on pluginList because the tree that owns contentRef is not
    // rendered until pluginList arrives, so a mount-only effect would find the
    // ref empty and never observe anything.
    const contentRef = useRef(null);
    useEffect(() => {
        if (!contentRef.current) {
            return;
        }
        let cancelled = false;
        // One in-flight resize at a time, plus a short cooldown. Resizing the
        // window reflows the content, which re-enters this observer; without
        // both guards the re-entries stack up and the window thrashes through
        // thousands of resize cycles before it settles.
        let resizing = false;
        let cooldownUntil = 0;
        let shrinkTimer = null;
        const RESIZE_COOLDOWN_MS = 60;
        // Content grows in stages (plugin list, then service config, then each
        // translation landing). Growing right away keeps the window ahead of
        // the text, while shrinking waits until things settle so a briefly
        // empty box does not make the window jump up and back down.
        const SHRINK_DELAY_MS = 250;
        // Measure and resize. Returns early when the window already matches.
        const resizeToContent = async () => {
            if (cancelled || !contentRef.current) {
                return;
            }
            const monitor = await currentMonitor();
            const maxHeight = Math.round((monitor.size.height / monitor.scaleFactor) * TRANSLATE_MAX_SCREEN_RATIO);
            // Sum the children's heights instead of reading scrollHeight.
            // scrollHeight never reports less than clientHeight, and the
            // container is stretched by the very window height this effect
            // controls — so once the window was too tall, scrollHeight echoed
            // that height and the window could never shrink back.
            const contentHeight = sumChildrenHeight(contentRef.current) + TRANSLATE_HEADER_HEIGHT;
            const targetHeight = Math.min(Math.max(contentHeight, TRANSLATE_MIN_HEIGHT), maxHeight);
            const currentSize = (await appWindow.outerSize()).toLogical(monitor.scaleFactor);
            if (Math.abs(currentSize.height - targetHeight) < 1) {
                return;
            }
            // Width is left untouched: the user owns it.
            await appWindow.setSize(new LogicalSize(currentSize.width, targetHeight));
            // Ignore the reflow our own resize just caused.
            cooldownUntil = Date.now() + RESIZE_COOLDOWN_MS;
        };

        const applyContentHeight = async () => {
            if (cancelled || !contentRef.current || resizing || Date.now() < cooldownUntil) {
                return;
            }
            resizing = true;
            try {
                const monitor = await currentMonitor();
                const maxHeight = Math.round(
                    (monitor.size.height / monitor.scaleFactor) * TRANSLATE_MAX_SCREEN_RATIO
                );
                const contentHeight = sumChildrenHeight(contentRef.current) + TRANSLATE_HEADER_HEIGHT;
                const targetHeight = Math.min(Math.max(contentHeight, TRANSLATE_MIN_HEIGHT), maxHeight);
                const currentSize = (await appWindow.outerSize()).toLogical(monitor.scaleFactor);
                if (Math.abs(currentSize.height - targetHeight) < 1) {
                    return;
                }
                if (targetHeight < currentSize.height) {
                    // Wait for the layout to settle before shrinking, so a
                    // briefly empty box does not make the window jump up and
                    // back down. The timer commits the shrink itself — calling
                    // back into applyContentHeight would re-take this same
                    // branch and loop forever without ever resizing.
                    if (shrinkTimer) {
                        clearTimeout(shrinkTimer);
                    }
                    shrinkTimer = setTimeout(() => {
                        shrinkTimer = null;
                        void resizeToContent();
                    }, SHRINK_DELAY_MS);
                    return;
                }
                await resizeToContent();
            } finally {
                resizing = false;
            }
        };
        // Observe the children, not the container: the container is stretched
        // by the window, so its own box only reports the window height. The
        // children are what actually grow when a translation arrives.
        const resizeObserver = new ResizeObserver(() => {
            void applyContentHeight();
        });
        const observeChildren = () => {
            resizeObserver.disconnect();
            for (const child of contentRef.current.children) {
                resizeObserver.observe(child);
            }
        };
        // Children are added and removed as services load and results stream in.
        const mutationObserver = new MutationObserver(() => {
            observeChildren();
            void applyContentHeight();
        });
        mutationObserver.observe(contentRef.current, { childList: true });
        // Children can still be empty on the render that first produces the
        // ref, so attach after the browser has committed the layout.
        observeChildren();
        requestAnimationFrame(() => {
            if (!cancelled) {
                observeChildren();
                void applyContentHeight();
            }
        });
        void applyContentHeight();
        return () => {
            cancelled = true;
            resizeObserver.disconnect();
            mutationObserver.disconnect();
            if (shrinkTimer) {
                clearTimeout(shrinkTimer);
            }
        };
    }, [pluginList]);

    const loadPluginList = async () => {
        const serviceTypeList = ['translate', 'tts', 'recognize', 'collection'];
        let temp = {};
        for (const serviceType of serviceTypeList) {
            temp[serviceType] = {};
            if (await exists(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig })) {
                const plugins = await readDir(`plugins/${serviceType}`, { dir: BaseDirectory.AppConfig });
                for (const plugin of plugins) {
                    const infoStr = await readTextFile(`plugins/${serviceType}/${plugin.name}/info.json`, {
                        dir: BaseDirectory.AppConfig,
                    });
                    let pluginInfo = JSON.parse(infoStr);
                    if ('icon' in pluginInfo) {
                        const appConfigDirPath = await appConfigDir();
                        const iconPath = await join(
                            appConfigDirPath,
                            `/plugins/${serviceType}/${plugin.name}/${pluginInfo.icon}`
                        );
                        pluginInfo.icon = convertFileSrc(iconPath);
                    }
                    temp[serviceType][plugin.name] = pluginInfo;
                }
            }
        }
        setPluginList({ ...temp });
    };

    useEffect(() => {
        loadPluginList();
        if (!unlisten) {
            unlisten = listen('reload_plugin_list', loadPluginList);
        }
    }, []);

    const loadServiceInstanceConfigMap = async () => {
        const config = {};
        for (const serviceInstanceKey of translateServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of recognizeServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of ttsServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        for (const serviceInstanceKey of collectionServiceInstanceList) {
            config[serviceInstanceKey] = (await store.get(serviceInstanceKey)) ?? {};
        }
        setServiceInstanceConfigMap({ ...config });
    };
    useEffect(() => {
        if (
            translateServiceInstanceList !== null &&
            recognizeServiceInstanceList !== null &&
            ttsServiceInstanceList !== null &&
            collectionServiceInstanceList !== null
        ) {
            loadServiceInstanceConfigMap();
        }
    }, [
        translateServiceInstanceList,
        recognizeServiceInstanceList,
        ttsServiceInstanceList,
        collectionServiceInstanceList,
    ]);

    return (
        pluginList && (
            <div
                className={`bg-background w-screen h-screen flex flex-col ${
                    osType === 'Linux' && 'rounded-[10px] border-1 border-default-100'
                }`}
            >
                <div
                    className='fixed top-[5px] left-[5px] right-[5px] h-[30px]'
                    data-tauri-drag-region='true'
                />
                <div className={`h-[35px] shrink-0 w-full flex ${osType === 'Darwin' ? 'justify-end' : 'justify-between'}`}>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='flat'
                        disableAnimation
                        className='my-auto bg-transparent'
                        onPress={() => {
                            if (pined) {
                                if (closeOnBlur) {
                                    unlisten = listenBlur();
                                }
                                appWindow.setAlwaysOnTop(false);
                            } else {
                                unlistenBlur();
                                appWindow.setAlwaysOnTop(true);
                            }
                            setPined(!pined);
                        }}
                    >
                        <BsPinFill className={`text-[20px] ${pined ? 'text-primary' : 'text-default-400'}`} />
                    </Button>
                    <Button
                        isIconOnly
                        size='sm'
                        variant='flat'
                        disableAnimation
                        className={`my-auto ${osType === 'Darwin' && 'hidden'} bg-transparent`}
                        onPress={() => {
                            void appWindow.close();
                        }}
                    >
                        <AiFillCloseCircle className='text-[20px] text-default-400' />
                    </Button>
                </div>
                {/* Fills whatever height the window gives it (the sizing effect
                    is what decides that), so the scroll area always ends where
                    the window ends instead of leaving a strip of background. */}
                <div className='px-[8px] flex-1 min-h-0'>
                    <div
                        className='overflow-y-auto h-full'
                        ref={contentRef}
                    >
                        {serviceInstanceConfigMap !== null && (
                            <SourceArea
                                pluginList={pluginList}
                                serviceInstanceConfigMap={serviceInstanceConfigMap}
                            />
                        )}
                        <div className={`${hideLanguage && 'hidden'}`}>
                            <LanguageArea />
                            <Spacer y={2} />
                        </div>
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable
                                droppableId='droppable'
                                direction='vertical'
                            >
                                {(provided) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                    >
                                        {translateServiceInstanceList !== null &&
                                            serviceInstanceConfigMap !== null &&
                                            translateServiceInstanceList.map((serviceInstanceKey, index) => {
                                                const config = serviceInstanceConfigMap[serviceInstanceKey] ?? {};
                                                const enable = config['enable'] ?? true;

                                                return enable ? (
                                                    <Draggable
                                                        key={serviceInstanceKey}
                                                        draggableId={serviceInstanceKey}
                                                        index={index}
                                                    >
                                                        {(provided) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                            >
                                                                <TargetArea
                                                                    {...provided.dragHandleProps}
                                                                    index={index}
                                                                    name={serviceInstanceKey}
                                                                    translateServiceInstanceList={
                                                                        translateServiceInstanceList
                                                                    }
                                                                    pluginList={pluginList}
                                                                    serviceInstanceConfigMap={serviceInstanceConfigMap}
                                                                />
                                                                <Spacer y={2} />
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ) : (
                                                    <></>
                                                );
                                            })}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>
                </div>
            </div>
        )
    );
}
