{{clientDirective}}import React, { createContext, useContext } from 'react';

const {{Name}}Context = createContext(null);

export function use{{Name}}() {
  const context = useContext({{Name}}Context);
  if (!context) {
    throw new Error('use{{Name}} must be used within a <{{Name}} />');
  }
  return context;
}

export function {{Name}}({ children, className = '', ...props }) {
  return (
    <{{Name}}Context.Provider value={{}}>
      <div className={`{{nameKebab}} ${className}`.trim()} data-testid="{{nameKebab}}" {...props}>
        {children}
      </div>
    </{{Name}}Context.Provider>
  );
}

export function {{Name}}Header({ children, className = '', ...props }) {
  return (
    <header className={`{{nameKebab}}-header ${className}`.trim()} data-testid="{{nameKebab}}-header" {...props}>
      {children}
    </header>
  );
}

export function {{Name}}Content({ children, className = '', ...props }) {
  return (
    <div className={`{{nameKebab}}-content ${className}`.trim()} data-testid="{{nameKebab}}-content" {...props}>
      {children}
    </div>
  );
}

export function {{Name}}Footer({ children, className = '', ...props }) {
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
