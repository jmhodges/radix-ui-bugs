import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as Dialog from '@radix-ui/react-dialog';

// Step 2 of the issue: the last test in the file leaves a Dialog open. RTL's afterEach cleanup()
// unmounts it, FocusScope schedules its unmount timer, and nothing else runs before teardown.
describe('Dialog', () => {
  it('opens when the trigger is clicked (and is left open)', () => {
    render(
      <Dialog.Root>
        <Dialog.Trigger>open</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Content aria-describedby={undefined}>
            <Dialog.Title>Title</Dialog.Title>
            <button>inside</button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );

    fireEvent.click(screen.getByText('open'));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
