import React from 'react';

// Shows a teletext "no signal" page with the error instead of a blank black screen.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="app">
        <header className="topbar"><span>P.404 UNTACTICAL</span><span>SEGNALE ASSENTE</span></header>
        <p className="loading">IL TELEVISORE HA PRESO UNA BOTTA. RICARICA LA PAGINA.</p>
        <pre className="crash">{String(error?.stack || error)}</pre>
      </div>
    );
  }
}
