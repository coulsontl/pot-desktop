import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Button } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import { osType } from '../../../utils/env';
// Import Language from ./info, not ./index: index re-exports Config first, so
// going through it leaves Language undefined when `voices` below is built at
// module load time.
import { Language } from './info';
import { tts } from './index';

const voices = [
    { key: Language.zh_cn, label: '中文（zh-CN）' },
    { key: Language.zh_tw, label: '繁體中文（zh-TW）' },
    { key: Language.en, label: 'English（en-US）' },
];

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const [systemConfig, setSystemConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.tts.system_tts.title'),
            voice: Language.zh_cn,
        },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);
    const toastStyle = useToastStyle();

    return (
        systemConfig !== null && (
            <>
                <Toaster />
                <div className='config-item'>
                    <h3 className='my-auto'>{t('services.tts.system_tts.voice')}</h3>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button variant='bordered'>
                                {voices.find((v) => v.key === systemConfig.voice)?.label ?? systemConfig.voice}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='voice'
                            onAction={(key) => {
                                setSystemConfig({
                                    ...systemConfig,
                                    voice: key,
                                });
                            }}
                        >
                            {voices.map((voice) => (
                                <DropdownItem key={voice.key}>{voice.label}</DropdownItem>
                            ))}
                        </DropdownMenu>
                    </Dropdown>
                </div>
                <div className='config-item'>
                    <p className='text-[12px] text-default-500'>
                        {t('services.tts.system_tts.hint', { os: osType })}
                    </p>
                </div>
                <div>
                    <Button
                        isLoading={isLoading}
                        fullWidth
                        color='primary'
                        onPress={() => {
                            setIsLoading(true);
                            tts('hello', systemConfig.voice, { config: systemConfig }).then(
                                () => {
                                    setIsLoading(false);
                                    setSystemConfig(systemConfig, true);
                                    updateServiceList(instanceKey);
                                    onClose();
                                },
                                (e) => {
                                    setIsLoading(false);
                                    // Keep the instance even when the probe
                                    // fails, so a misconfigured service stays
                                    // editable instead of disappearing.
                                    setSystemConfig(systemConfig, true);
                                    updateServiceList(instanceKey);
                                    toast.error(t('config.service.test_failed') + e.toString(), {
                                        style: toastStyle,
                                    });
                                }
                            );
                        }}
                    >
                        {t('common.save')}
                    </Button>
                </div>
            </>
        )
    );
}
