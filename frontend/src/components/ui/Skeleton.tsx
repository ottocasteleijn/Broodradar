import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Rounded circle (e.g. for avatars) */
  circle?: boolean;
  /** Single line of text height; use multiple Skeleton for multiple lines */
  text?: boolean;
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, circle, text, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "animate-pulse bg-slate-200",
        circle && "rounded-full",
        !circle && "rounded-md",
        text && "h-4",
        className
      )}
      {...props}
    />
  )
);
Skeleton.displayName = "Skeleton";

export { Skeleton };
