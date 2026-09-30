/* The world has no router. The copied chat imports `useNavigate` from react-router-dom; Vite (`resolve.alias`) and
   tsconfig (`paths`) point that import here. A navigation goes to the handler the app registers: in demo mode
   `/settings/agents` opens the world's own Settings card. */
type Navigator = (to: string) => void;

let navigator: Navigator | null = null;

/** The app registers what a navigation does; `null` unregisters. */
export function setNavigator(next: Navigator | null): void {
  navigator = next;
}

export function useNavigate(): (to: string) => Promise<void> {
  return (to) => {
    navigator?.(to);
    return Promise.resolve();
  };
}
