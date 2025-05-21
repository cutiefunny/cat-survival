import React, { createContext, useContext, useState } from 'react';

interface SkillsContextType {
  skills: number[];
  addSkill: (skill: number) => void;
}

const SkillsContext = createContext<SkillsContextType | undefined>(undefined);

interface SkillsProviderProps {
  children: React.ReactNode;
}

export const SkillsProvider: React.FC<SkillsProviderProps> = ({ children }) => {
  const [skills, setSkills] = useState<number[]>([]);

  const addSkill = (skill: number) => {
    setSkills(prevSkills => [...prevSkills, skill]);
  };

  const value: SkillsContextType = { skills, addSkill };

  return (
    <SkillsContext.Provider value={value}>
      {children}
    </SkillsContext.Provider>
  );
};

export const useSkills = () => {
  const context = useContext(SkillsContext);
  console.log('useSkills context:', context); // Debugging line
  if (!context) {
    throw new Error('useSkills must be used within a SkillsProvider');
  }
  return context;
};