import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusScope } from '@radix-ui/react-focus-scope';

// A bare FocusScope with nothing calling preventDefault() on the unmount event. This takes the
// "hand focus back to previouslyFocusedElement ?? document.body" path in the timer, which is why
// the issue notes that capturing only `CustomEvent` is not enough to fix it.
describe('FocusScope', () => {
  it('traps focus while mounted (and is left mounted)', () => {
    render(
      <>
        <input aria-label="outside" defaultValue="outside" />
        <FocusScope trapped>
          <button>first</button>
          <button>second</button>
        </FocusScope>
      </>
    );

    expect(document.activeElement).toBe(screen.getByText('first'));
  });
});
