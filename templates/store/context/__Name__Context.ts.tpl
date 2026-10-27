import { createContext } from 'react';

export interface {{Name}}ContextValue {
{{contextProperties}}
}

export const {{Name}}Context = createContext<{{Name}}ContextValue | null>(null);
