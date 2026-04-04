import { createContext, useContext, useState } from 'react';

const ModeContext = createContext();

export function ModeProvider({ children }) {
  const [mode, setMode] = useState('worker');
  const toggle = () => setMode(m => m === 'worker' ? 'admin' : 'worker');
  return (
    <ModeContext.Provider value={{ mode, toggle, isAdmin: mode === 'admin' }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within ModeProvider');
  return ctx;
}
