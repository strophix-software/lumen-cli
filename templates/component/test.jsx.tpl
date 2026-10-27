import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { {{Name}} } from './{{Name}}';

describe('{{Name}} Component', () => {
  it('renders without crashing', () => {
    render(<{{Name}} />);
    expect(screen.getByTestId('{{nameKebab}}')).toBeDefined();
  });
});
