import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FormFieldProps {
  /** Visible field label, wired to the control via `htmlFor`. */
  label: string;
  /** `id` of the control this label points at (and the describedby anchor). */
  htmlFor: string;
  /** Show the required asterisk + mark the field required for AT. */
  required?: boolean;
  /** Error message — replaces the helper and gets `role="alert"`. */
  error?: string;
  /** Supporting hint shown below the control when there is no error. */
  helper?: string;
  /** Dim the whole field group. */
  disabled?: boolean;
  /** The control (input/select/textarea/etc.). */
  children: React.ReactNode;
  className?: string;
}

/**
 * FormField — label + control + helper/error, wired for a11y.
 *
 * The label points at the control (`htmlFor`), and both helper and error are
 * exposed via `aria-describedby` (the consumer spreads the matching `id`s onto
 * the control). Error text is `role="alert"` and supersedes the helper.
 */
export function FormField({
  label,
  htmlFor,
  required,
  error,
  helper,
  disabled,
  children,
  className,
}: FormFieldProps) {
  const helperId = `${htmlFor}-helper`;
  const errorId = `${htmlFor}-error`;

  return (
    <div
      className={cn("flex flex-col gap-1.5", disabled && "opacity-60", className)}
      aria-disabled={disabled || undefined}
    >
      <Label htmlFor={htmlFor} className="text-xs font-bold">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </Label>

      {children}

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
