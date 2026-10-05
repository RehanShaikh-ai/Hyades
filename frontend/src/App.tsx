import React from 'react';
import { HyadesApp } from '@/pages/HyadesApp';
import { useHealth } from '@/hooks/useHealth';

export const App: React.FC = () => {
  const { status, checkHealth } = useHealth(15000);

  return <HyadesApp healthStatus={status} onRefreshHealth={checkHealth} />;
};

export default App;
