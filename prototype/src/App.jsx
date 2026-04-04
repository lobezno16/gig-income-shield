import { ModeProvider } from './context/ModeContext';
import ModeToggle from './components/ModeToggle';
import HeroSection from './sections/HeroSection';
import ProblemSection from './sections/ProblemSection';
import HowItWorksSection from './sections/HowItWorksSection';
import LiveSimulation from './sections/LiveSimulation';
import TrustSection from './sections/TrustSection';
import AdminSnapshot from './sections/AdminSnapshot';
import CTASection from './sections/CTASection';

export default function App() {
  return (
    <ModeProvider>
      <ModeToggle />
      <main>
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <LiveSimulation />
        <TrustSection />
        <AdminSnapshot />
        <CTASection />
      </main>
    </ModeProvider>
  );
}
