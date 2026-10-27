{{clientDirective}}import React from 'react';

export function {{Name}}({ children, className = '', ...props }) {
  return (
    <div className={`{{nameKebab}} ${className}`.trim()} data-testid="{{nameKebab}}" {...props}>
      {children || <span>{{Name}} component</span>}
    </div>
  );
}

export default {{Name}};
