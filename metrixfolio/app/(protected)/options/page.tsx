'use client';
import { useState } from 'react';
import OptionManager from './components/OptionManager';
import IvCrushRadar from './components/IvCrushRadar';
import { FiBriefcase, FiZap } from 'react-icons/fi';

export default function OptionsPage() {
  const [activeTab, setActiveTab] = useState<'manager' | 'radar'>('manager');

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="tabs tabs-boxed bg-base-100/50 backdrop-blur-md border border-base-content/5 shadow p-1 w-full max-w-sm self-center">
        <a 
          className={`tab flex-1 gap-2 font-bold transition-all ${activeTab === 'manager' ? 'tab-active !bg-primary !text-primary-content shadow-sm' : ''}`}
          onClick={() => setActiveTab('manager')}
        >
          <FiBriefcase /> Active Options
        </a>
        <a 
          className={`tab flex-1 gap-2 font-bold transition-all ${activeTab === 'radar' ? 'tab-active !bg-accent !text-accent-content shadow-sm' : ''}`}
          onClick={() => setActiveTab('radar')}
        >
          <FiZap /> IV Crush Radar
        </a>
      </div>

      <div className="flex-1 mt-2">
        {activeTab === 'manager' && <OptionManager />}
        {activeTab === 'radar' && <IvCrushRadar />}
      </div>
    </div>
  );
}
