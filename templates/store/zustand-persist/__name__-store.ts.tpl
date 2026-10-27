import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface {{Name}}State {
{{stateProperties}}
}

export const use{{Name}}Store = create<{{Name}}State>()(
  persist(
    (set) => ({
{{stateInitial}}
    }),
    {
      name: '{{nameKebab}}-storage',
    }
  )
);
