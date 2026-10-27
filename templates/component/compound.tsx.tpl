{{clientDirective}}import React, { createContext, useContext } from 'react';

interface {{Name}}ContextValue {
  // Add compound component shared context state here
}

const {{Name}}Context = createContext<{{Name}}ContextValue | null>(null);

export function use{{Name}}() {
  const context = useContext({{Name}}Context);
  if (!context) {
    throw new Error('use{{Name}} must be used within a <{{Name}} />');
  }
  return context;
}

export interface {{Name}}Props extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function {{Name}}({ children, className = '', ...props }: {{Name}}Props) {
  return (
    <{{Name}}Context.Provider value={{}}>
      <div className={`{{nameKebab}} ${className}`.trim()} data-testid="{{nameKebab}}" {...props}>
        {children}
      </div>
    </{{Name}}Context.Provider>
  );
}

export interface {{Name}}HeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function {{Name}}Header({ children, className = '', ...props }: {{Name}}HeaderProps) {
  return (
    <header className={`{{nameKebab}}-header ${className}`.trim()} data-testid="{{nameKebab}}-header" {...props}>
      {children}
    </header>
  );
}

export interface {{Name}}ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function {{Name}}Content({ children, className = '', ...props }: {{Name}}ContentProps) {
  return (
    <div className={`{{nameKebab}}-content ${className}`.trim()} data-testid="{{nameKebab}}-content" {...props}>
      {children}
    </div>
  );
}

export interface {{Name}}FooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function {{Name}}Footer({ children, className = '', ...props }: {{Name}}FooterProps) {
  return (
    <footer className={`{{nameKebab}}-footer ${className}`.trim()} data-testid="{{nameKebab}}-footer" {...props}>
      {children}
    </footer>
  );
}

{{Name}}.Header = {{Name}}Header;
{{Name}}.Content = {{Name}}Content;
{{Name}}.Footer = {{Name}}Footer;

export default {{Name}};
