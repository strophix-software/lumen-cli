import { create } from 'zustand';

export interface {{Name}}State {
{{stateProperties}}
}

export const use{{Name}}Store = create<{{Name}}State>((set) => ({
{{stateInitial}}
}));
