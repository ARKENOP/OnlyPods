import { render, screen } from '@testing-library/react';
import App from './App';

test('renders OnlyPods title', () => {
  render(<App />);
  const title = screen.getByRole('heading', { name: /onlypods/i });
  expect(title).toBeInTheDocument();
});
