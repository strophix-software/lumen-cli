import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const use{{Name}}Store = create(
  persist(
    (set) => ({
{{stateInitial}}
    }),
    {
      name: '{{nameKebab}}-storage',
    }
  )
);
