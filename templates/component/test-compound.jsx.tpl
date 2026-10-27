import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { {{Name}} } from './{{Name}}';

describe('{{Name}} Compound Component', () => {
  it('renders compound hierarchy correctly', () => {
    render(
      <{{Name}}>
        <{{Name}}.Header>Header</{{Name}}.Header>
        <{{Name}}.Content>Content</{{Name}}.Content>
        <{{Name}}.Footer>Footer</{{Name}}.Footer>
      </{{Name}}>
    );
    expect(screen.getByTestId('{{nameKebab}}')).toBeDefined();
    expect(screen.getByTestId('{{nameKebab}}-header')).toBeDefined();
    expect(screen.getByTestId('{{nameKebab}}-content')).toBeDefined();
    expect(screen.getByTestId('{{nameKebab}}-footer')).toBeDefined();
  });
});
