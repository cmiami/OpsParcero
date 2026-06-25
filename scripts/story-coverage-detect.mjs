/**
 * Story-coverage detectors (#19) — extracted so they can be unit-tested.
 *
 * Source-regex heuristics (no react-docgen) broadened beyond `*Props` to catch
 * the React/Radix idioms the old gate missed: React.ComponentProps,
 * ComponentPropsWithoutRef/WithRef, HTMLAttributes, VariantProps, and Radix
 * interactive primitives. The thin shadcn `ui/` wrappers re-export upstream-typed
 * props (documented by Radix/React, not us), so they're exempt from the
 * argTypes/play requirement — the broadened detection is enforced on PRODUCT
 * components (atoms → templates). The durable upgrade is react-docgen-typescript;
 * this keeps the cheap regex gate honest for product code.
 */

/** Does the component declare props (so its story should document them via argTypes)? */
export function hasProps(src) {
  return (
    /(interface|type)\s+\w*Props\b/.test(src) ||
    /:\s*\w*Props\b/.test(src) ||
    /React\.ComponentProps|ComponentPropsWith(?:out)?Ref|HTMLAttributes|VariantProps/.test(
      src,
    )
  );
}

/** Is the component interactive (so its story should exercise it with a play fn)? */
export function isInteractive(src) {
  return (
    /\bon[A-Z]\w*\s*[?:]/.test(src) || // a handler PROP is declared
    /\b(useState|useReducer)\b/.test(src) || // owns interactive state
    /\son(Click|Change|Select|ValueChange|CheckedChange|OpenChange|Submit)=/.test(
      src,
    ) || // binds a handler in JSX
    /@radix-ui\/react-(switch|radio-group|checkbox|tabs|select|dropdown-menu|dialog|popover|accordion|collapsible|toggle|toggle-group|slider|menubar|navigation-menu)\b/.test(
      src,
    ) // wraps a Radix interactive primitive
  );
}

/**
 * Thin design-system primitives under `components/ui/` re-export Radix/HTML
 * props; they only need a meta + named story (argTypes/play would just restate
 * upstream-documented props). Product components are NOT exempt.
 */
export function isPrimitiveComponent(relPath) {
  return /(^|\/)components\/ui\//.test(relPath.replace(/\\/g, "/"));
}
