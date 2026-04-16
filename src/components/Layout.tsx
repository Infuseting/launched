import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-neutral-950 font-sans antialiased selection:bg-blue-500/30">
      <main>
        {children}
      </main>
    </div>
  );
};

export default Layout;
