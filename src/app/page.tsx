import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import ProblemMatrix from "@/components/landing/ProblemMatrix";
import WorkflowDiagram from "@/components/landing/WorkflowDiagram";
import CorePillars from "@/components/landing/CorePillars";
import UseCases from "@/components/landing/UseCases";
import AIArchitecture from "@/components/landing/AIArchitecture";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-surface font-sans text-text">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProblemMatrix />
        <WorkflowDiagram />
        <CorePillars />
        <UseCases />
        <AIArchitecture />
      </main>
      <Footer />
    </div>
  );
}
