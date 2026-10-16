import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-contrast hover:opacity-90",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
}

export function Button({ variant = "primary", block, className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
        "transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        block && "w-full",
        className,
      )}
      {...props}
    />
  );
}
