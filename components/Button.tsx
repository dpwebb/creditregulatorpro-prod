import React from "react";
import { Slot } from "@radix-ui/react-slot";
import styles from "./Button.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "outline"
    | "ghost"
    | "link"
    | "destructive"
    | "default"
    | "error";
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm" | "icon-md" | "icon-lg";
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      asChild = false,
      className,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    // Map aliases to their actual variants
    const normalizedVariant =
      variant === "default" ? "primary" : variant === "error" ? "destructive" : variant;

    return (
      <Comp
        ref={ref}
        type={type}
        className={`
        ${styles.button} 
        ${styles[normalizedVariant]} 
        ${styles[size]} 
        ${disabled ? styles.disabled : ""} 
        ${className || ""}
      `}
        disabled={disabled}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

Button.displayName = "Button";
