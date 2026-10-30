/* The design-system primitives. Pages import from here and nowhere else; a new need is a variant.
   Menu is a verbatim copy of crewhub-loops' (the chat needs it; scripts/check-bubbles-copy.mjs keeps it in sync). */
export { Button, type ButtonProps, type ButtonVariant } from "./Button";
export { Card, type CardProps } from "./Card";
export { Chip, type KitStatus } from "./Chip";
export { Field, type FieldProps } from "./Field";
export { Menu, useContextMenu, type MenuForm, type MenuItem, type MenuProps } from "./Menu";
