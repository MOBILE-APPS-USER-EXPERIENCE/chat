import { defaultConfig } from '@tamagui/config/v6'
import { animationsCSS } from '@tamagui/config/animations-css'
import { createFont, createTamagui, isWeb } from 'tamagui'

const systemFont = createFont({
    ...defaultConfig.fonts.body,
    family: isWeb ? 'system-ui' : 'System',
})

const brandThemes = {
    light: {
        ...defaultConfig.themes.light,
        text: '#193058',
        accent: '#b6163d',
        accentContrast: '#ffffff',
        background: '#ffffff',
        backgroundElement: '#eaf2fa',
        backgroundSelected: '#b4d3ed',
        textSecondary: '#60646C',
        error: '#d64545',
        errorBackground: '#f8d7da',
        errorText: '#ffeaea',
    },
    dark: {
        ...defaultConfig.themes.dark,
        text: '#eaf2fa',
        accent: '#b6163d',
        accentContrast: '#ffffff',
        background: '#193058',
        backgroundElement: '#005b94',
        backgroundSelected: '#8abde2',
        textSecondary: '#dbe9f7',
        error: '#d64545',
        errorBackground: '#642127',
        errorText: '#ffeaea',
    },
}

export const tamaguiConfig = createTamagui({
    ...defaultConfig,
    animations: animationsCSS,
    fonts: {
        ...defaultConfig.fonts,
        body: systemFont,
        heading: systemFont,
    },
    themes: {
        ...defaultConfig.themes,
        ...brandThemes,
    },
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
    interface TamaguiCustomConfig extends Conf { }
}
