import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import ProblemMatrix from "@/components/landing/ProblemMatrix";
import WorkflowDiagram from "@/components/landing/WorkflowDiagram";
import CorePillars from "@/components/landing/CorePillars";
import AIArchitecture from "@/components/landing/AIArchitecture";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background font-sans text-foreground">
      <Navbar />
      <main className="flex-1">
        {/* Hero: Intro + unique data flow (3-panel: Input → Engine → Output) */}
        <Hero />
        {/* Konteks: Before vs After comparison */}
        <ProblemMatrix />
        {/* Alur Kerja: 4 steps horizontal (workflow, unique: includes sanitization step) */}
        <WorkflowDiagram />
        {/* Kapabilitas: 6 concrete feature areas in grid */}
        <CorePillars />
        {/* Arsitektur & Privasi: PII architecture + CTA */}
        <AIArchitecture />
      </main>
      <Footer />
    </div>
  );
}
