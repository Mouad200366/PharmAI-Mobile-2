import { MaterialIcons } from '@expo/vector-icons'

interface IconProps {
  // Accepts the same snake_case names used throughout the web app's pages
  // (e.g. "local_shipping", "location_on") for easy copy-paste when porting
  // screens — converted to MaterialIcons' kebab-case glyph names internally.
  name: string
  size?: number
  color?: string
  fill?: boolean // kept for API parity with web's Icon.tsx (Material Symbols "fill" axis);
  // MaterialIcons has no fill variant, so this is currently a no-op.
}

// Mobile equivalent of the web app's Icon.tsx. Web uses Google's
// "Material Symbols" font with snake_case ligature names (e.g.
// "local_shipping"); @expo/vector-icons' MaterialIcons set covers the same
// icons but with kebab-case names (e.g. "local-shipping"), so we convert.
export default function Icon({ name, size = 24, color = '#111827' }: IconProps) {
  const kebabName = name.replace(/_/g, '-') as React.ComponentProps<typeof MaterialIcons>['name']
  return <MaterialIcons name={kebabName} size={size} color={color} />
}

