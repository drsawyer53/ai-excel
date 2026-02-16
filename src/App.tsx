import "./App.css";
import { SchemaBuilder } from "./components/SchemaBuilder";

export default function App() {
  return (
    <div className="app">
      <h1>AI Excel</h1>
      <p className="subtitle">
        Describe what you want to build. We’ll generate a structured sheet schema.
      </p>

      <SchemaBuilder />
    </div>
  );
}

