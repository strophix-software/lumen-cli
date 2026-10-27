{{clientDirective}}import React from 'react';

export interface {{Name}}Props extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function {{Name}}({ children, className = '', ...props }: {{Name}}Props) {
  return (
    <div className={`{{nameKebab}} ${className}`.trim()} data-testid="{{nameKebab}}" {...props}>
      {children || <span>{{Name}} component</span>}
    </div>
  );
}

export default {{Name}};
