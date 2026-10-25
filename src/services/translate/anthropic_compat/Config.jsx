import { Input, Button, Switch, Textarea, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@nextui-org/react';
import { MdDeleteOutline } from 'react-icons/md';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';
import { translate, Language } from './index';

export const DEFAULT_PROMPTS = [
    {
        role: 'system',
        content:
            'You are a professional translator. Translate the input text to {target_language}.\n' +
            'Rules:\n' +
            '- Output ONLY the translation, no explanation, no quotes.\n' +
            '- Preserve original formatting, line breaks, and punctuation.\n' +
            '- For technical terms, keep the English original in parentheses.',
    },
    { role: 'user', content: 'Translate into {target_language}:\n\n{text}' },
];

const AUTH_HEADERS = [
    { key: 'x-api-key', label: 'x-api-key' },
    { key: 'authorization', label: 'Authorization: Bearer' },
];

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const [config, setConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.translate.anthropic_compat.title'),
            requestPath: 'https://api.anthropic.com/v1',
            authHeader: 'x-api-key',
            apiKey: '',
            apiVersion: '2023-06-01',
            model: 'claude-sonnet-5',
            maxTokens: 3840,
            temperature: 0,
            stream: true,
            promptList: DEFAULT_PROMPTS,
        },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);
    const toastStyle = useToastStyle();
    const update = (patch) => setConfig({ ...config, ...patch });

    return (
        config !== null && (
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    setIsLoading(true);
                    translate('hello', Language.auto, Language.zh_cn, { config }).then(
                        () => {
                            setIsLoading(false);
                            setConfig(config, true);
                            updateServiceList(instanceKey);
                            onClose();
                        },
                        (err) => {
                            setIsLoading(false);
                            // Keep the instance even when the probe fails: a
                            // misconfigured service must stay editable instead
                            // of vanishing from the list with no way back.
                            setConfig(config, true);
                            updateServiceList(instanceKey);
                            toast.error(t('config.service.test_failed') + err.toString(), { style: toastStyle });
                        }
                    );
                }}
            >
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={config[INSTANCE_NAME_CONFIG_KEY]}
                        variant='bordered'
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ [INSTANCE_NAME_CONFIG_KEY]: value })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.anthropic_compat.base_url')}
                        labelPlacement='outside-left'
                        value={config.requestPath}
                        variant='bordered'
                        description={t('services.translate.anthropic_compat.base_url_hint')}
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ requestPath: value })}
                    />
                </div>
                <div className='config-item'>
                    <h3 className='my-auto'>{t('services.translate.anthropic_compat.auth_header')}</h3>
                    <Dropdown>
                        <DropdownTrigger>
                            <Button variant='bordered'>
                                {AUTH_HEADERS.find((h) => h.key === config.authHeader)?.label ?? config.authHeader}
                            </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                            aria-label='auth-header'
                            onAction={(key) => update({ authHeader: key })}
                        >
                            {AUTH_HEADERS.map((header) => (
                                <DropdownItem key={header.key}>{header.label}</DropdownItem>
                            ))}
                        </DropdownMenu>
                    </Dropdown>
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.anthropic_compat.api_key')}
                        labelPlacement='outside-left'
                        type='password'
                        value={config.apiKey}
                        variant='bordered'
                        placeholder={t('services.translate.anthropic_compat.api_key_hint')}
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ apiKey: value })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.anthropic_compat.api_version')}
                        labelPlacement='outside-left'
                        value={config.apiVersion}
                        variant='bordered'
                        description={t('services.translate.anthropic_compat.api_version_hint')}
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ apiVersion: value })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        label={t('services.translate.anthropic_compat.model')}
                        labelPlacement='outside-left'
                        value={config.model}
                        variant='bordered'
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ model: value })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        type='number'
                        label={t('services.translate.anthropic_compat.max_tokens')}
                        labelPlacement='outside-left'
                        value={String(config.maxTokens)}
                        min={1}
                        step={256}
                        variant='bordered'
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ maxTokens: value })}
                    />
                </div>
                <div className='config-item'>
                    <Input
                        type='number'
                        label={t('services.translate.anthropic_compat.temperature')}
                        labelPlacement='outside-left'
                        value={String(config.temperature)}
                        step={0.1}
                        min={0}
                        max={1}
                        variant='bordered'
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => update({ temperature: value })}
                    />
                </div>
                <div className='config-item'>
                    <Switch
                        isSelected={config.stream}
                        onValueChange={(value) => update({ stream: value })}
                        classNames={{ base: 'flex flex-row-reverse justify-between w-full max-w-full' }}
                    >
                        {t('services.translate.anthropic_compat.stream')}
                    </Switch>
                </div>

                <h3 className='my-auto'>{t('services.translate.anthropic_compat.prompt_list')}</h3>
                <p className='text-[10px] text-default-700'>{t('services.translate.anthropic_compat.prompt_description')}</p>
                <div className='bg-content2 rounded-[10px] p-3'>
                    {config.promptList.map((prompt, index) => (
                        <div
                            className='config-item'
                            key={index}
                        >
                            <Textarea
                                label={prompt.role}
                                labelPlacement='outside'
                                variant='faded'
                                value={prompt.content}
                                onValueChange={(value) =>
                                    update({
                                        promptList: config.promptList.map((item, i) =>
                                            i === index ? { ...item, content: value } : item
                                        ),
                                    })
                                }
                            />
                            <Button
                                isIconOnly
                                color='danger'
                                className='my-auto mx-1'
                                variant='flat'
                                onPress={() =>
                                    update({ promptList: config.promptList.filter((_, i) => i !== index) })
                                }
                            >
                                <MdDeleteOutline className='text-[18px]' />
                            </Button>
                        </div>
                    ))}
                    <Button
                        fullWidth
                        onPress={() =>
                            update({
                                promptList: [...config.promptList, { role: 'user', content: '' }],
                            })
                        }
                    >
                        {t('services.translate.anthropic_compat.add_prompt')}
                    </Button>
                </div>
                <br />
                <Button
                    type='submit'
                    isLoading={isLoading}
                    fullWidth
                    color='primary'
                >
                    {t('common.save')}
                </Button>
            </form>
        )
    );
}
