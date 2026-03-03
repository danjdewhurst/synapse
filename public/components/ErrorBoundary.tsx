import { Button, Flex, Text } from "@radix-ui/themes";
import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Uncaught error:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <Flex
          direction="column"
          align="center"
          justify="center"
          style={{ height: "100vh", padding: "2rem", textAlign: "center" }}
        >
          <Text size="5" weight="bold" mb="2">
            Something went wrong
          </Text>
          <Text size="2" color="gray" mb="4">
            {this.state.error?.message || "An unexpected error occurred"}
          </Text>
          <Button onClick={this.handleReset}>Try again</Button>
        </Flex>
      );
    }

    return this.props.children;
  }
}
