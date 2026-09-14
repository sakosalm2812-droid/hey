import { Component } from "react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="hey-state-page" role="alert">
          <p className="hey-state-kicker">Something went wrong</p>
          <h1>HEY could not open this view.</h1>
          <p>Refresh the page and try again. If the problem continues, check your connection and account configuration.</p>
          <button className="hey-btn-primary" type="button" onClick={() => window.location.reload()}>Refresh HEY</button>
        </main>
      );
    }

    return this.props.children;
  }
}
