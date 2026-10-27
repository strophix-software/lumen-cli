import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfig } from '../../config/index.js';
import { LumenError, EXIT } from '../../errors.js';
import { validateName, toKebab, toPascal } from '../../generators/names.js';
import { applyPlan, syncAgentContext, assertPathContained } from '../../generators/core.js';
import { applyThemePreset, listThemePresets, loadThemesMetadata } from './theme.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const THEMES_DIR = path.resolve(__dirname, '../../../templates/themes');
const THEMES_JSON = path.join(THEMES_DIR, 'themes.json');

export const DEFAULT_LUMEN_REGISTRY_URL =
  process.env.LUMEN_REGISTRY_URL ||
  'https://raw.githubusercontent.com/strophix-software/lumen-registry/main/public/r';
export const DEFAULT_SHADCN_REGISTRY_URL = 'https://ui.shadcn.com/r';

export const RECOMMENDED_PACKAGE_VERSIONS = {
  '@radix-ui/react-slot': '^1.1.0',
  '@radix-ui/react-dialog': '^1.1.2',
  '@radix-ui/react-label': '^2.1.0',
  '@radix-ui/react-checkbox': '^1.1.2',
  '@radix-ui/react-switch': '^1.1.1',
  '@radix-ui/react-avatar': '^1.1.1',
  '@radix-ui/react-tabs': '^1.1.1',
  '@radix-ui/react-dropdown-menu': '^2.1.2',
  '@radix-ui/react-tooltip': '^1.1.4',
  '@radix-ui/react-separator': '^1.1.0',
  '@radix-ui/react-select': '^2.1.2',
  '@tanstack/react-table': '^8.20.5',
  'clsx': '^2.1.1',
  'tailwind-merge': '^2.5.4',
  'class-variance-authority': '^0.7.1',
  'lucide-react': '^0.460.0',
};

/**
 * Built-in Lumen blocks and primitives catalog.
 */
export const LUMEN_COMPONENTS = {
  'data-table': {
    name: 'data-table',
    source: 'lumen',
    type: 'block',
    title: 'Data Table',
    description: 'Lumen responsive data table with sorting, filtering, and pagination',
    dependencies: ['@tanstack/react-table', 'clsx', 'tailwind-merge', 'lucide-react'],
    files: [
      {
        path: 'DataTable.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface DataTableProps<TData> {
  data: TData[];
  columns: Array<{
    header: string;
    accessorKey?: keyof TData;
    cell?: (item: TData) => React.ReactNode;
  }>;
  className?: string;
  emptyMessage?: string;
}

export function DataTable<TData extends Record<string, any>>({
  data,
  columns,
  className,
  emptyMessage = "No results found.",
}: DataTableProps<TData>) {
  return (
    <div className={cn("w-full overflow-auto rounded-md border border-border", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr className="border-b border-border transition-colors">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="h-10 px-4 text-left align-middle font-medium text-muted-foreground"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="h-24 text-center align-middle text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="p-4 align-middle">
                    {col.cell
                      ? col.cell(row)
                      : col.accessorKey
                      ? String(row[col.accessorKey] ?? "")
                      : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  data = [],
  columns = [],
  className,
  emptyMessage = "No results found.",
}) {
  return (
    <div className={cn("w-full overflow-auto rounded-md border border-border", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr className="border-b border-border transition-colors">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className="h-10 px-4 text-left align-middle font-medium text-muted-foreground"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="h-24 text-center align-middle text-muted-foreground"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="p-4 align-middle">
                    {col.cell
                      ? col.cell(row)
                      : col.accessorKey
                      ? String(row[col.accessorKey] ?? "")
                      : null}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
`,
      },
    ],
  },
  'metric-card': {
    name: 'metric-card',
    source: 'lumen',
    type: 'block',
    title: 'Metric Card',
    description: 'Lumen KPI metric card with trend indicators and status colors',
    dependencies: ['clsx', 'tailwind-merge', 'lucide-react'],
    files: [
      {
        path: 'MetricCard.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string | number;
  trend?: "up" | "down" | "neutral";
  description?: string;
  className?: string;
}

export function MetricCard({
  title,
  value,
  change,
  trend = "neutral",
  description,
  className,
}: MetricCardProps) {
  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium tracking-tight text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
      {(change !== undefined || description) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {change !== undefined && (
            <span className={cn("font-medium", trendColor)}>
              {trend === "up" ? "+" : ""}{change}{" "}
            </span>
          )}
          {description}
        </p>
      )}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  change,
  trend = "neutral",
  description,
  className,
}) {
  const trendColor =
    trend === "up"
      ? "text-emerald-500"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="text-sm font-medium tracking-tight text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">{value}</div>
      {(change !== undefined || description) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {change !== undefined && (
            <span className={cn("font-medium", trendColor)}>
              {trend === "up" ? "+" : ""}{change}{" "}
            </span>
          )}
          {description}
        </p>
      )}
    </div>
  );
}
`,
      },
    ],
  },
  'stat-card': {
    name: 'stat-card',
    source: 'lumen',
    type: 'block',
    title: 'Stat Card',
    description: 'Lumen statistics card with icon, change badge, and description',
    dependencies: ['clsx', 'tailwind-merge', 'lucide-react'],
    files: [
      {
        path: 'StatCard.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  className?: string;
}

export function StatCard({ label, value, subtext, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
        {value}
      </div>
      {subtext && <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, subtext, className }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
        {value}
      </div>
      {subtext && <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>}
    </div>
  );
}
`,
      },
    ],
  },
  'auth-card': {
    name: 'auth-card',
    source: 'lumen',
    type: 'block',
    title: 'Auth Card',
    description: 'Lumen authentication card with title, subtitle, and action slots',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [
      {
        path: 'AuthCard.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface AuthCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-md",
        className
      )}
    >
      <div className="mb-6 space-y-1.5 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-6 border-t border-border pt-4 text-center text-sm">{footer}</div>}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-xl border border-border bg-card p-8 text-card-foreground shadow-md",
        className
      )}
    >
      <div className="mb-6 space-y-1.5 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-6 border-t border-border pt-4 text-center text-sm">{footer}</div>}
    </div>
  );
}
`,
      },
    ],
  },
  'page-header': {
    name: 'page-header',
    source: 'lumen',
    type: 'block',
    title: 'Page Header',
    description: 'Lumen page header with title, description, and action button container',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [
      {
        path: 'PageHeader.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 border-b border-border md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 pb-6 border-b border-border md:flex-row md:items-center md:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
`,
      },
    ],
  },
  'empty-state': {
    name: 'empty-state',
    source: 'lumen',
    type: 'block',
    title: 'Empty State',
    description: 'Lumen empty state view with title, description, and action button',
    dependencies: ['clsx', 'tailwind-merge', 'lucide-react'],
    files: [
      {
        path: 'EmptyState.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center",
        className
      )}
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}) {
  return (
    <div
      className={cn(
        "flex min-h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center",
        className
      )}
    >
      <div className="mx-auto flex max-w-[420px] flex-col items-center text-center">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mb-4 mt-2 text-sm text-muted-foreground">{description}</p>
        {action}
      </div>
    </div>
  );
}
`,
      },
    ],
  },
};

/**
 * Built-in Shadcn fallback primitives catalog.
 */
export const SHADCN_FALLBACK_COMPONENTS = {
  button: {
    name: 'button',
    source: 'shadcn',
    type: 'primitive',
    title: 'Button',
    description: 'Displays a button or a component that looks like a button.',
    dependencies: ['@radix-ui/react-slot', 'clsx', 'tailwind-merge', 'class-variance-authority'],
    files: [
      {
        path: 'Button.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const buttonVariants = ({
  variant = "default",
  size = "default",
  className = "",
}: {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
} = {}) => {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

  const variants = {
    default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    destructive:
      "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline:
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
    secondary:
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };

  return cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, className);
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = ({
  variant = "default",
  size = "default",
  className = "",
} = {}) => {
  const base =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

  const variants = {
    default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    destructive:
      "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline:
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
    secondary:
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };

  return cn(base, variants[variant] || variants.default, sizes[size] || sizes.default, className);
};

const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
`,
      },
    ],
  },
  card: {
    name: 'card',
    source: 'shadcn',
    type: 'primitive',
    title: 'Card',
    description: 'Displays a card with header, content, and footer.',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Card.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight text-foreground", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight text-foreground", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
`,
      },
    ],
  },
  input: {
    name: 'input',
    source: 'shadcn',
    type: 'primitive',
    title: 'Input',
    description: 'Displays a form input field or a component that looks like an input field.',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Input.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
`,
      },
    ],
  },
  badge: {
    name: 'badge',
    source: 'shadcn',
    type: 'primitive',
    title: 'Badge',
    description: 'Displays a badge or a component that looks like a badge.',
    dependencies: ['clsx', 'tailwind-merge', 'class-variance-authority'],
    files: [
      {
        path: 'Badge.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
    outline: "text-foreground border-border",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, variant = "default", ...props }) {
  const variants = {
    default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
    outline: "text-foreground border-border",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  );
}

export { Badge };
`,
      },
    ],
  },
  dialog: {
    name: 'dialog',
    source: 'shadcn',
    type: 'primitive',
    title: 'Dialog',
    description: 'A window overlaid on either the primary window or another dialog window.',
    dependencies: ['@radix-ui/react-dialog', 'clsx', 'tailwind-merge', 'lucide-react'],
    files: [
      {
        path: 'Dialog.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-50 w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4", className)} {...props} />;
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="relative z-50 w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <h2 className={cn("text-lg font-semibold leading-none tracking-tight text-foreground", className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4", className)} {...props} />;
}
`,
      },
    ],
  },
  avatar: {
    name: 'avatar',
    source: 'shadcn',
    type: 'primitive',
    title: 'Avatar',
    description: 'An image element with a fallback for representing the user.',
    dependencies: ['@radix-ui/react-avatar', 'clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Avatar.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
}

export function Avatar({ src, alt = "", fallback = "?", className, ...props }: AvatarProps) {
  const [error, setError] = React.useState(false);

  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted",
        className
      )}
      {...props}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt}
          onError={() => setError(true)}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
          {fallback}
        </div>
      )}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Avatar({ src, alt = "", fallback = "?", className, ...props }) {
  const [error, setError] = React.useState(false);

  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border bg-muted",
        className
      )}
      {...props}
    >
      {src && !error ? (
        <img
          src={src}
          alt={alt}
          onError={() => setError(true)}
          className="aspect-square h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
          {fallback}
        </div>
      )}
    </div>
  );
}
`,
      },
    ],
  },
  tabs: {
    name: 'tabs',
    source: 'shadcn',
    type: 'primitive',
    title: 'Tabs',
    description: 'A set of layered sections of content—known as tab panels—that are displayed one at a time.',
    dependencies: ['@radix-ui/react-tabs', 'clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Tabs.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (val: string) => void;
  children: React.ReactNode;
  className?: string;
}

const TabsContext = React.createContext<{
  currentValue: string;
  setValue: (v: string) => void;
}>({ currentValue: "", setValue: () => {} });

export function Tabs({ defaultValue = "", value, onValueChange, children, className }: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value !== undefined ? value : internalValue;
  const setValue = onValueChange || setInternalValue;

  return (
    <TabsContext.Provider value={{ currentValue, setValue }}>
      <div className={cn("w-full space-y-2", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { currentValue, setValue } = React.useContext(TabsContext);
  const isActive = currentValue === value;

  return (
    <button
      type="button"
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow"
          : "hover:bg-background/50 hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { currentValue } = React.useContext(TabsContext);
  if (currentValue !== value) return null;

  return (
    <div
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

const TabsContext = React.createContext({ currentValue: "", setValue: () => {} });

export function Tabs({ defaultValue = "", value, onValueChange, children, className }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value !== undefined ? value : internalValue;
  const setValue = onValueChange || setInternalValue;

  return (
    <TabsContext.Provider value={{ currentValue, setValue }}>
      <div className={cn("w-full space-y-2", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className, children, ...props }) {
  const { currentValue, setValue } = React.useContext(TabsContext);
  const isActive = currentValue === value;

  return (
    <button
      type="button"
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow"
          : "hover:bg-background/50 hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children, ...props }) {
  const { currentValue } = React.useContext(TabsContext);
  if (currentValue !== value) return null;

  return (
    <div
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
`,
      },
    ],
  },
  label: {
    name: 'label',
    source: 'shadcn',
    type: 'primitive',
    title: 'Label',
    description: 'Renders an accessible label associated with controls.',
    dependencies: ['@radix-ui/react-label', 'clsx', 'tailwind-merge', 'class-variance-authority'],
    files: [
      {
        path: 'Label.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
}
`,
      },
    ],
  },
  textarea: {
    name: 'textarea',
    source: 'shadcn',
    type: 'primitive',
    title: 'Textarea',
    description: 'Displays a form textarea or a component that looks like a textarea.',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Textarea.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";
`,
      },
    ],
  },
  checkbox: {
    name: 'checkbox',
    source: 'shadcn',
    type: 'primitive',
    title: 'Checkbox',
    description: 'A control that allows the user to toggle between checked and not checked.',
    dependencies: ['@radix-ui/react-checkbox', 'clsx', 'tailwind-merge', 'lucide-react'],
    files: [
      {
        path: 'Checkbox.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className={cn(
          "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 accent-primary",
          className
        )}
        {...props}
      />
    );
  }
);
Checkbox.displayName = "Checkbox";
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className={cn(
          "h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 accent-primary",
          className
        )}
        {...props}
      />
    );
  }
);
Checkbox.displayName = "Checkbox";
`,
      },
    ],
  },
  switch: {
    name: 'switch',
    source: 'shadcn',
    type: 'primitive',
    title: 'Switch',
    description: 'A control that allows the user to toggle between checked and unchecked states.',
    dependencies: ['@radix-ui/react-switch', 'clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Switch.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked = false, onCheckedChange, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({ checked = false, onCheckedChange, disabled = false, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
`,
      },
    ],
  },
  tooltip: {
    name: 'tooltip',
    source: 'shadcn',
    type: 'primitive',
    title: 'Tooltip',
    description: 'A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.',
    dependencies: ['@radix-ui/react-tooltip', 'clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Tooltip.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            "absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md transition-opacity",
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Tooltip({ content, children, className }) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={cn(
            "absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md transition-opacity",
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
`,
      },
    ],
  },
  separator: {
    name: 'separator',
    source: 'shadcn',
    type: 'primitive',
    title: 'Separator',
    description: 'Visually or semantically separates content.',
    dependencies: ['@radix-ui/react-separator', 'clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Separator.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export function Separator({
  orientation = "horizontal",
  className,
  ...props
}: SeparatorProps) {
  return (
    <div
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({
  orientation = "horizontal",
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      )}
      {...props}
    />
  );
}
`,
      },
    ],
  },
  skeleton: {
    name: 'skeleton',
    source: 'shadcn',
    type: 'primitive',
    title: 'Skeleton',
    description: 'Use to show a placeholder while content is loading.',
    dependencies: ['clsx', 'tailwind-merge'],
    files: [
      {
        path: 'Skeleton.tsx',
        contentTs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
`,
        contentJs: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
`,
      },
    ],
  },
};

/**
 * Fetch a component from the Lumen Registry (registry.lumen.dev).
 * @param {string} name Normalized component name
 * @param {object} [options={}]
 * @returns {Promise<object | null>}
 */
export async function fetchLumenRegistry(name, options = {}) {
  const hasCustomFetch = Boolean(options.fetch);
  const hasCustomUrl = Boolean(options.lumenRegistryUrl || process.env.LUMEN_REGISTRY_URL);

  // If a mock or custom fetch/URL is provided, prioritize querying remote
  if (hasCustomFetch || hasCustomUrl) {
    const baseUrl = options.lumenRegistryUrl || process.env.LUMEN_REGISTRY_URL || DEFAULT_LUMEN_REGISTRY_URL;
    const fetchFn = options.fetch || globalThis.fetch;

    if (fetchFn) {
      const cleanBase = baseUrl.replace(/\/+$/, '');
      const urlsToTry = cleanBase.endsWith('/r')
        ? [
            `${cleanBase}/${name}.json`,
            `${cleanBase}/styles/new-york/${name}.json`,
          ]
        : [
            `${cleanBase}/r/${name}.json`,
            `${cleanBase}/r/styles/new-york/${name}.json`,
            `${cleanBase}/components/${name}.json`,
          ];

      for (const url of urlsToTry) {
        try {
          const timeout = options.timeout || 3000;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);

          const res = await fetchFn(url, { signal: controller.signal });
          clearTimeout(timer);

          if (res.status === 200) {
            const data = await res.json();
            if (data && (data.files || data.name)) {
              return {
                source: 'lumen',
                ...data,
                name: data.name || name,
              };
            }
          }
        } catch {
          // Fall through
        }
      }
    }
  }

  // Check built-in Lumen catalog
  if (Object.prototype.hasOwnProperty.call(LUMEN_COMPONENTS, name)) {
    return { ...LUMEN_COMPONENTS[name] };
  }

  // If it's a known Shadcn fallback component and no custom Lumen registry was specified,
  // skip attempting external Lumen fetch to allow instant fallback
  if (!hasCustomFetch && !hasCustomUrl && Object.prototype.hasOwnProperty.call(SHADCN_FALLBACK_COMPONENTS, name)) {
    return null;
  }

  // For unknown components without custom fetch, attempt fast remote query
  if (!hasCustomFetch && !hasCustomUrl && globalThis.fetch) {
    const baseUrl = DEFAULT_LUMEN_REGISTRY_URL;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeout || 500);
      const res = await globalThis.fetch(`${baseUrl}/r/${name}.json`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 200) {
        const data = await res.json();
        return {
          source: 'lumen',
          ...data,
          name: data.name || name,
        };
      }
    } catch {
      // Offline or not found
    }
  }

  return null;
}

/**
 * Fetch a component from the Shadcn UI fallback (ui.shadcn.com).
 * @param {string} name Normalized component name
 * @param {object} [options={}]
 * @returns {Promise<object | null>}
 */
export async function fetchShadcnRegistry(name, options = {}) {
  const hasCustomFetch = Boolean(options.fetch);
  const hasCustomUrl = Boolean(options.shadcnRegistryUrl || process.env.SHADCN_REGISTRY_URL);

  // If a mock or custom fetch/URL is provided, prioritize querying remote
  if (hasCustomFetch || hasCustomUrl) {
    const baseUrl = options.shadcnRegistryUrl || process.env.SHADCN_REGISTRY_URL || DEFAULT_SHADCN_REGISTRY_URL;
    const fetchFn = options.fetch || globalThis.fetch;

    if (fetchFn) {
      const urlsToTry = [
        `${baseUrl.replace(/\/+$/, '')}/styles/new-york/${name}.json`,
        `${baseUrl.replace(/\/+$/, '')}/${name}.json`,
      ];

      for (const url of urlsToTry) {
        try {
          const timeout = options.timeout || 3000;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeout);

          const res = await fetchFn(url, { signal: controller.signal });
          clearTimeout(timer);

          if (res.status === 200) {
            const data = await res.json();
            if (data && (data.files || data.name)) {
              return {
                source: 'shadcn',
                ...data,
                name: data.name || name,
              };
            }
          }
        } catch {
          // Fall through
        }
      }
    }
  }

  // Check built-in Shadcn catalog
  if (Object.prototype.hasOwnProperty.call(SHADCN_FALLBACK_COMPONENTS, name)) {
    return { ...SHADCN_FALLBACK_COMPONENTS[name] };
  }

  // For unknown components without custom fetch, attempt fast remote query
  if (!hasCustomFetch && !hasCustomUrl && globalThis.fetch) {
    const baseUrl = DEFAULT_SHADCN_REGISTRY_URL;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeout || 500);
      const res = await globalThis.fetch(`${baseUrl}/styles/new-york/${name}.json`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 200) {
        const data = await res.json();
        return {
          source: 'shadcn',
          ...data,
          name: data.name || name,
        };
      }
    } catch {
      // Offline or not found
    }
  }

  return null;
}

/**
 * Resolves a UI component by name:
 * 1. Checks Lumen Registry (registry.lumen.dev)
 * 2. Falls back to Shadcn UI (ui.shadcn.com)
 *
 * @param {string} name Component name (kebab or pascal)
 * @param {object} [options={}] Custom URLs or fetch implementation
 * @returns {Promise<{ name: string, source: 'lumen' | 'shadcn', type: string, dependencies: string[], files: Array<{ path: string, contentTs?: string, contentJs?: string, content?: string }> }>}
 */
export async function resolveUiComponent(name, options = {}) {
  const normalized = toKebab(validateName(name));

  // 1. Try Lumen Registry first
  const lumenComponent = await fetchLumenRegistry(normalized, options);
  if (lumenComponent) {
    return {
      ...lumenComponent,
      source: 'lumen',
      name: normalized,
    };
  }

  // 2. Try Shadcn fallback
  const shadcnComponent = await fetchShadcnRegistry(normalized, options);
  if (shadcnComponent) {
    return {
      ...shadcnComponent,
      source: 'shadcn',
      name: normalized,
    };
  }

  // 3. Not found in either
  throw new LumenError(
    `Component "${name}" was not found in the Lumen Registry or Shadcn fallback.`,
    {
      code: EXIT.USER,
      hint: 'Run "lumen g ui --list" to view all available components.',
    }
  );
}

/**
 * Load available themes from templates/themes/themes.json.
 * @returns {Array<{ id: string, name: string, description: string, fonts: string[] }>}
 */
export function loadAvailableThemes() {
  if (fs.existsSync(THEMES_JSON)) {
    try {
      const raw = fs.readFileSync(THEMES_JSON, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Lists all available UI components from Lumen Registry and Shadcn fallback,
 * along with preset themes.
 * @returns {{ lumen: Array<{ name: string, type: string, description: string }>, shadcn: Array<{ name: string, type: string, description: string }>, themes: Array<{ id: string, name: string, description: string }> }}
 */
export function listUiComponents() {
  const lumenList = Object.values(LUMEN_COMPONENTS).map((c) => ({
    name: c.name,
    type: c.type || 'block',
    description: c.description || '',
    source: 'lumen',
  }));

  const shadcnList = Object.values(SHADCN_FALLBACK_COMPONENTS).map((c) => ({
    name: c.name,
    type: c.type || 'primitive',
    description: c.description || '',
    source: 'shadcn',
  }));

  const themes = loadAvailableThemes();

  return {
    lumen: lumenList,
    shadcn: shadcnList,
    themes,
  };
}

/**
 * Check dependencies status in target project's package.json.
 * @param {string} root Project root directory
 * @param {string[]} dependencies Required dependency names
 * @returns {Array<{ name: string, installed: boolean }>}
 */
export function checkUiDependencies(root, dependencies = []) {
  const pkgPath = path.join(root, 'package.json');
  let installedDeps = {};

  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const parsed = JSON.parse(raw);
      installedDeps = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
      };
    } catch {
      // Ignore parse failure; treat as missing
    }
  }

  return dependencies.map((pkg) => ({
    name: pkg,
    installed: Object.prototype.hasOwnProperty.call(installedDeps, pkg),
  }));
}

/**
 * Adds missing peer dependencies to package.json.
 * @param {string} root Project root directory
 * @param {string[]} missingDeps Missing dependency names
 * @param {{ dryRun?: boolean }} options
 * @returns {string[]} Newly added package names
 */
export function installPeerDependencies(root, missingDeps = [], { dryRun = false } = {}) {
  if (missingDeps.length === 0 || dryRun) return [];

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw);

    if (!pkg.dependencies) {
      pkg.dependencies = {};
    }

    const added = [];
    for (const dep of missingDeps) {
      if (!pkg.dependencies[dep] && (!pkg.devDependencies || !pkg.devDependencies[dep])) {
        const version = RECOMMENDED_PACKAGE_VERSIONS[dep] || '^1.0.0';
        pkg.dependencies[dep] = version;
        added.push(dep);
      }
    }

    if (added.length > 0) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }

    return added;
  } catch {
    return [];
  }
}

/**
 * Ensures cn utility exists in project (e.g. at src/lib/utils.ts or utils.js).
 * @param {string} root Project root directory
 * @param {boolean} isTs Whether project is TypeScript
 * @param {{ force?: boolean }} [options={}]
 * @returns {{ path: string, relPath: string, contents: string, action: 'create' | 'skip' | 'overwrite' } | null}
 */
export function ensureCnUtil(root, isTs, options = {}) {
  const ext = isTs ? 'ts' : 'js';
  const relPath = `src/lib/utils.${ext}`;
  const fullPath = path.join(root, relPath);

  // Check if utils already exists in src/lib or src/shared/utils/cn or src/utils/cn
  const alt1 = path.join(root, `src/shared/utils/cn.${ext}`);
  const alt2 = path.join(root, `src/utils/cn.${ext}`);

  if (fs.existsSync(alt1) || fs.existsSync(alt2)) {
    return null;
  }

  const exists = fs.existsSync(fullPath);
  if (exists && !options.force) {
    return null;
  }

  const contents = isTs
    ? `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}\n`
    : `import { clsx } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs) {\n  return twMerge(clsx(inputs));\n}\n`;

  return {
    path: fullPath,
    relPath,
    contents,
    action: exists ? 'overwrite' : 'create',
  };
}

/**
 * Register `lumen generate ui` command (and aliases).
 * @param {import('commander').Command} generate
 */
export function registerUi(generate) {
  const ui = generate
    .command('ui [target] [themeName]')
    .alias('theme')
    .description('Resolve and generate UI components from the Lumen Registry or apply preset theme tokens')
    .option('-l, --list', 'List available components or theme presets')
    .option('--dry-run', 'Preview changes without writing to disk')
    .option('-f, --force', 'Overwrite existing files or theme tokens')
    .addHelpText(
      'after',
      `
Examples:
  $ lumen generate ui theme-autumn-maple
  $ lumen g ui theme-calm-lake
  $ lumen g ui theme autumn-maple
  $ lumen g ui theme --list
  $ lumen g ui theme -l
  $ lumen g ui theme-neon-noir --dry-run
  $ lumen g ui theme-ocean-breeze --force
  $ lumen g ui button
  $ lumen g ui card
  $ lumen g ui app-shell
  $ lumen g ui data-table
  $ lumen g ui --list`
    )
    .action(async (target, themeName, cmdOpts, command) => {
      const globals = generate.optsWithGlobals ? generate.optsWithGlobals() : generate.opts ? generate.opts() : {};
      const options = {
        ...globals,
        ...cmdOpts,
      };
      const cwd = options.cwd || process.cwd();
      const isJson = Boolean(options.json);

      const isThemeAlias = command?.name?.() === 'theme';

      // 1. Invoked as `lumen g theme ...`
      if (isThemeAlias) {
        if (options.list || target === '--list' || target === '-l' || !target) {
          return listThemePresets({ options: { ...options, json: isJson } });
        }
        const themeId = target.startsWith('theme-') ? target.slice(6) : target;
        return await applyThemePreset({
          cwd,
          themeId,
          options: { ...options, json: isJson },
        });
      }

      // 2. Invoked as `lumen g ui theme [themeName]`
      if (target === 'theme') {
        if (options.list || themeName === '--list' || themeName === '-l') {
          return listThemePresets({ options: { ...options, json: isJson } });
        }
        if (themeName) {
          const themeId = themeName.startsWith('theme-') ? themeName.slice(6) : themeName;
          return await applyThemePreset({
            cwd,
            themeId,
            options: { ...options, json: isJson },
          });
        }
        throw new LumenError(
          'Theme preset name is required, e.g. "lumen g ui theme-<name>" or "lumen g ui theme <name>".',
          {
            code: EXIT.USER,
            hint: 'Run "lumen g ui theme --list" to view available presets.',
          }
        );
      }

      // 3. Invoked as `lumen g ui theme-<name>`
      if (typeof target === 'string' && target.startsWith('theme-')) {
        const themeId = target.slice('theme-'.length);
        return await applyThemePreset({
          cwd,
          themeId,
          options: { ...options, json: isJson },
        });
      }

      // 4. Direct preset name (e.g. `lumen g ui calm-lake`)
      if (target && typeof target === 'string') {
        const themes = loadThemesMetadata();
        const isPreset = themes.some((t) => t.id === target);
        if (isPreset) {
          return await applyThemePreset({
            cwd,
            themeId: target,
            options: { ...options, json: isJson },
          });
        }
      }

      // 5. Invoked with --list without target
      if (options.list || target === '--list' || target === '-l') {
        return await executeGenerateUi(null, options);
      }

      // 6. Invoked without arguments
      if (!target) {
        throw new LumenError('UI component or theme preset name is required.', {
          code: EXIT.USER,
          hint: 'Specify a theme preset (e.g. "lumen g ui theme-autumn-maple") or run "lumen g ui theme --list".',
        });
      }

      // 7. Generate UI component from registry
      return await executeGenerateUi(target, options);
    });

  return ui;
}

/**
 * Handle preset theme tokens generation (delegates to theme generator).
 * @param {string} themeId Theme identifier without prefix (e.g. 'ocean-breeze')
 * @param {object} options
 * @returns {Promise<object>}
 */
export async function executeApplyTheme(themeId, options = {}) {
  const cwd = options.cwd || process.cwd();
  const res = await applyThemePreset({
    cwd,
    themeId,
    options: {
      ...options,
      json: Boolean(options.json),
    },
  });

  const file = res.file || 'themes.css';
  const action = res.action || 'created';
  const isCreated = action === 'created' || action === 'create' || action === 'merged';

  return {
    ...res,
    kind: 'theme',
    theme: typeof res.theme === 'string' ? res.theme : res.theme?.id || themeId,
    created: isCreated ? [file] : [],
    overwritten: action === 'overwritten' || action === 'overwrite' ? [file] : [],
    skipped: action === 'skip' ? [file] : [],
    plan: [{ relPath: file, action }],
  };
}

/**
 * Execute UI generator logic.
 * @param {string} [name] Component name or theme-<name>
 * @param {object} [options={}] Command options
 * @returns {Promise<object>}
 */
export async function executeGenerateUi(name, options = {}) {
  // 1. Handle --list or 'theme --list'
  if (options.list || (!name && options.list)) {
    const catalog = listUiComponents();

    if (name === 'theme') {
      if (options.json) {
        process.stdout.write(`${JSON.stringify({ success: true, kind: 'theme-list', themes: catalog.themes }, null, 2)}\n`);
      } else {
        process.stdout.write('\nAvailable Preset Themes:\n');
        for (const t of catalog.themes) {
          process.stdout.write(`  • ${t.id.padEnd(16)} ${t.name.padEnd(18)} ${t.description}\n`);
        }
        process.stdout.write('\nUsage:\n  $ lumen g ui theme-<id> [--dry-run] [--force]\n\n');
      }
      return { success: true, kind: 'theme-list', themes: catalog.themes };
    }

    if (options.json) {
      const payload = {
        success: true,
        kind: 'ui-list',
        registry: options.lumenRegistryUrl || process.env.LUMEN_REGISTRY_URL || DEFAULT_LUMEN_REGISTRY_URL,
        fallback: options.shadcnRegistryUrl || process.env.SHADCN_REGISTRY_URL || DEFAULT_SHADCN_REGISTRY_URL,
        components: [...catalog.lumen, ...catalog.shadcn],
        themes: catalog.themes,
      };
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      return payload;
    }

    process.stdout.write('\nLumen UI Component Registry:\n');
    process.stdout.write(`  Registry: ${options.lumenRegistryUrl || process.env.LUMEN_REGISTRY_URL || DEFAULT_LUMEN_REGISTRY_URL}\n`);
    process.stdout.write(`  Fallback: ${options.shadcnRegistryUrl || process.env.SHADCN_REGISTRY_URL || DEFAULT_SHADCN_REGISTRY_URL}\n\n`);

    process.stdout.write('Lumen Registry Components (Blocks & Primitives):\n');
    for (const item of catalog.lumen) {
      process.stdout.write(`  • ${item.name.padEnd(16)} [${item.type}] ${item.description}\n`);
    }

    process.stdout.write('\nShadcn UI Fallback Components (Primitives):\n');
    for (const item of catalog.shadcn) {
      process.stdout.write(`  • ${item.name.padEnd(16)} [${item.type}] ${item.description}\n`);
    }

    process.stdout.write('\nPreset Visual Themes (Tailwind v4 @theme):\n');
    process.stdout.write(`Available theme presets (${catalog.themes.length}):\n`);
    for (const t of catalog.themes) {
      process.stdout.write(`  • ${t.id.padEnd(16)} ${t.name.padEnd(18)} ${t.description}\n`);
    }
    const themeNames = catalog.themes.map((t) => t.id).join(', ');
    process.stdout.write(`  ${themeNames}\n`);

    process.stdout.write('\nUsage:\n');
    process.stdout.write('  $ lumen g ui <name> [--dry-run] [--force]\n');
    process.stdout.write('  $ lumen g ui theme-<name> [--dry-run] [--force]\n\n');

    return {
      success: true,
      kind: 'ui-list',
      components: [...catalog.lumen, ...catalog.shadcn],
      themes: catalog.themes,
    };
  }

  // 2. Validate input name
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new LumenError('Component name is required. Use "lumen g ui --list" to view available components.', {
      code: EXIT.USER,
      hint: 'Provide a component name, e.g. "lumen g ui button" or view available items with --list.',
    });
  }

  const trimmed = name.trim();

  // Handle theme-<name>
  if (trimmed.startsWith('theme-')) {
    const themeId = trimmed.slice(6);
    return await executeApplyTheme(themeId, options);
  }

  const validatedName = validateName(trimmed);
  const normalizedName = toKebab(validatedName);
  const pascalName = toPascal(validatedName);

  // 3. Read project configuration
  const { manifest, paths, root } = readConfig({ cwd: options.cwd });

  if (!paths.ui || typeof paths.ui !== 'string') {
    throw new LumenError('Missing "paths.ui" in manifest configuration for UI component generation.', {
      code: EXIT.USER,
      hint: 'Ensure your lumen.config.json has a valid paths.ui directory configured.',
    });
  }

  if (manifest.styling?.engine && manifest.styling.engine !== 'tailwind') {
    throw new LumenError(`UI kit components require styling engine "tailwind" (got "${manifest.styling?.engine}").`, {
      code: EXIT.USER,
      hint: 'UI components rely on Tailwind v4 (@theme tokens). Configure styling.engine to "tailwind".',
    });
  }

  // 4. Resolve component (Lumen Registry -> Shadcn fallback)
  const resolved = await resolveUiComponent(normalizedName, options);

  const isTs = (manifest.tooling?.language || 'ts') === 'ts';
  const utilExt = isTs ? 'ts' : 'js';

  // 5. Build generation plan
  const plan = [];
  const targetUiDir = paths.ui;

  // Primary component files
  for (const file of resolved.files || []) {
    let baseFileName = path.basename(file.path);
    // Replace ts/tsx with js/jsx if project is JS
    if (!isTs) {
      baseFileName = baseFileName.replace(/\.tsx$/, '.jsx').replace(/\.ts$/, '.js');
    }

    const destRelPath = path.posix.join(targetUiDir, baseFileName);
    const destFullPath = path.resolve(root, destRelPath);
    assertPathContained(root, destFullPath);

    let content = isTs
      ? (file.contentTs || file.content || '')
      : (file.contentJs || file.content || '');

    // If only TS content was provided in remote response, strip types for JS
    if (!isTs && !file.contentJs && file.contentTs) {
      content = file.contentTs
        .replace(/:\s*React\.FC<[^>]+>/g, '')
        .replace(/interface\s+[\s\S]*?\}\n/g, '')
        .replace(/type\s+[\s\S]*?;\n/g, '')
        .replace(/<HTML[A-Za-z]+Element(?:,\s*[^>]+)?>/g, '')
        .replace(/as\s+any/g, '');
    }

    const exists = fs.existsSync(destFullPath);
    const action = exists ? (options.force ? 'overwrite' : 'skip') : 'create';

    plan.push({
      path: destFullPath,
      relPath: destRelPath,
      contents: content,
      action,
    });
  }

  // Ensure index barrel in paths.ui
  const indexRelPath = path.posix.join(targetUiDir, `index.${utilExt}`);
  const indexFullPath = path.resolve(root, indexRelPath);
  assertPathContained(root, indexFullPath);

  const exportLine = `export * from './${pascalName}';\n`;
  if (fs.existsSync(indexFullPath)) {
    const existingIndex = fs.readFileSync(indexFullPath, 'utf8');
    if (!existingIndex.includes(`./${pascalName}`)) {
      const updatedIndex = existingIndex.endsWith('\n')
        ? `${existingIndex}${exportLine}`
        : `${existingIndex}\n${exportLine}`;
      plan.push({
        path: indexFullPath,
        relPath: indexRelPath,
        contents: updatedIndex,
        action: 'overwrite',
      });
    }
  } else {
    plan.push({
      path: indexFullPath,
      relPath: indexRelPath,
      contents: exportLine,
      action: 'create',
    });
  }

  // Ensure cn helper utility
  const cnPlan = ensureCnUtil(root, isTs, { force: options.force });
  if (cnPlan) {
    assertPathContained(root, cnPlan.path);
    plan.push(cnPlan);
  }

  // 6. Apply plan
  const result = applyPlan(plan, {
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
  });

  // 7. Handle dependencies in package.json
  const rawDeps = resolved.dependencies || [];
  const requiredDeps = Array.from(new Set([...rawDeps, 'clsx', 'tailwind-merge']));
  const depChecksBefore = checkUiDependencies(root, requiredDeps);
  const missingDeps = depChecksBefore.filter((d) => !d.installed).map((d) => d.name);

  let newlyAddedDeps = [];
  if (!options.dryRun && missingDeps.length > 0) {
    newlyAddedDeps = installPeerDependencies(root, missingDeps, { dryRun: false });
  }

  const finalDepStatus = requiredDeps.map((depName) => {
    const wasInstalled = depChecksBefore.find((d) => d.name === depName)?.installed || false;
    const added = newlyAddedDeps.includes(depName);
    return {
      name: depName,
      installed: wasInstalled || added,
      added,
    };
  });

  // 8. Agent context sync
  if (manifest.agentDocs && !options.dryRun) {
    await syncAgentContext(root);
  }

  // 9. Format output
  if (options.json) {
    const payload = {
      success: true,
      kind: 'ui',
      name: normalizedName,
      pascalName,
      source: resolved.source,
      type: resolved.type || 'primitive',
      targetDir: paths.ui,
      dryRun: Boolean(options.dryRun),
      force: Boolean(options.force),
      created: result.created,
      skipped: result.skipped,
      overwritten: result.overwritten,
      plan: result.plan.map((p) => ({
        relPath: p.relPath,
        action: p.action,
      })),
      packages: finalDepStatus,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    const sourceLabel =
      resolved.source === 'lumen'
        ? 'Lumen Registry'
        : 'Shadcn UI fallback';

    if (options.dryRun) {
      process.stdout.write(`\n[DRY RUN] Plan for UI component "${pascalName}" (resolved from ${sourceLabel}):\n`);
    } else {
      process.stdout.write(`\nResolved "${normalizedName}" from ${sourceLabel}\n`);
      process.stdout.write(`Generated UI component "${pascalName}":\n`);
    }

    for (const item of result.plan) {
      const tag =
        item.action === 'create'
          ? '+ CREATE'
          : item.action === 'overwrite'
          ? '! OVERWRITE'
          : '- SKIP';
      process.stdout.write(`  ${tag} ${item.relPath}\n`);
    }

    if (result.skipped.length > 0 && !options.force && !options.dryRun) {
      process.stdout.write(
        `\nNote: ${result.skipped.length} existing file(s) skipped. Use --force to overwrite.\n`
      );
    }

    if (finalDepStatus.length > 0) {
      process.stdout.write('\nPeer packages:\n');
      for (const pkg of finalDepStatus) {
        if (pkg.added) {
          process.stdout.write(`  + ${pkg.name}: added to package.json (run npm install)\n`);
        } else if (pkg.installed) {
          process.stdout.write(`  ✔ ${pkg.name}: installed\n`);
        } else {
          process.stdout.write(`  ⚠ ${pkg.name}: missing (install with npm i ${pkg.name})\n`);
        }
      }
    }
  }

  return {
    success: true,
    kind: 'ui',
    name: normalizedName,
    pascalName,
    source: resolved.source,
    type: resolved.type || 'primitive',
    targetDir: paths.ui,
    dryRun: Boolean(options.dryRun),
    force: Boolean(options.force),
    packages: finalDepStatus,
    ...result,
  };
}
