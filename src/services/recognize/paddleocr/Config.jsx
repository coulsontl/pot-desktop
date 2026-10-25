import { Input, Button } from '@nextui-org/react';
import toast, { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import React, { useState } from 'react';

import { useConfig } from '../../../hooks/useConfig';
import { useToastStyle } from '../../../hooks';
import { INSTANCE_NAME_CONFIG_KEY } from '../../../utils/service_instance';

export function Config(props) {
    const { instanceKey, updateServiceList, onClose } = props;
    const { t } = useTranslation();
    const [config, setConfig] = useConfig(
        instanceKey,
        {
            [INSTANCE_NAME_CONFIG_KEY]: t('services.recognize.paddleocr.title'),
        },
        { sync: false }
    );
    const [isLoading, setIsLoading] = useState(false);
    const toastStyle = useToastStyle();

    return (
        config !== null && (
            <>
                <Toaster />
                <div className='config-item'>
                    <Input
                        label={t('services.instance_name')}
                        labelPlacement='outside-left'
                        value={config[INSTANCE_NAME_CONFIG_KEY]}
                        variant='bordered'
                        classNames={{ base: 'justify-between', mainWrapper: 'max-w-[50%]' }}
                        onValueChange={(value) => setConfig({ ...config, [INSTANCE_NAME_CONFIG_KEY]: value })}
                    />
                </div>
                <div className='config-item'>
                    <p className='text-[12px] text-default-500'>{t('services.recognize.paddleocr.hint')}</p>
                </div>
                <div>
                    <Button
                        isLoading={isLoading}
                        fullWidth
                        color='primary'
                        onPress={() => {
                            // No cheap way to smoke-test a local model here, so
                            // saving just persists the name; the first real
                            // recognitions exercise the engine.
                            setIsLoading(true);
                            setConfig(config, true);
                            updateServiceList(instanceKey);
                            toast.success(t('common.save'), { style: toastStyle });
                            setIsLoading(false);
                            onClose();
                        }}
                    >
                        {t('common.save')}
                    </Button>
                </div>
            </>
        )
    );
}
