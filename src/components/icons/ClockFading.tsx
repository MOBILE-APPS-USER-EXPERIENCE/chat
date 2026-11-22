import { memo, type JSX } from 'react'
import { Svg, Path, type SvgProps } from 'react-native-svg'
import { themed, type IconProps } from '@tamagui/helpers-icon'

export const ClockFading: (props: IconProps) => JSX.Element = themed(
  memo(function ClockFading(props: IconProps) {
    const { color = 'black', size = 24, ...otherProps } = props as SvgProps & {
      color?: string
      size?: number
    }
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...otherProps}
      >
        <Path d="M12 2a10 10 0 0 1 7.38 16.75" stroke={color} />
        <Path d="M12 6v6l4 2" stroke={color} />
        <Path d="M2.5 8.875a10 10 0 0 0-.5 3" stroke={color} />
        <Path d="M2.83 16a10 10 0 0 0 2.43 3.4" stroke={color} />
        <Path d="M4.636 5.235a10 10 0 0 1 .891-.857" stroke={color} />
        <Path d="M8.644 21.42a10 10 0 0 0 7.631-.38" stroke={color} />
      </Svg>
    )
  })
)
