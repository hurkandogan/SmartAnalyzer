import FamilyManager from './components/FamilyManager';

export const metadata = {
  title: 'Family Portfolios - Metrixfolio',
};

export default function FamilyPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Family Portfolios</h1>
        <p className="text-base-content/70">
          Independent sub-portfolios for your family members.
        </p>
      </div>

      <FamilyManager />
    </div>
  );
}
