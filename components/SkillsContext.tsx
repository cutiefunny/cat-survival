import React, { createContext, useContext, useState } from 'react';

interface SkillsContextType {
  skills: number[];
  addSkill: (skill: number) => void;
  clearSkills: () => void;
}

const SkillsContext = createContext<SkillsContextType | undefined>(undefined);

interface SkillsProviderProps {
  children: React.ReactNode;
}

export const SkillsProvider: React.FC<SkillsProviderProps> = ({ children }) => {
  const [skills, setSkills] = useState<number[]>([]);

  const addSkill = (skill: number) => {
        console.log('addSkill called with skill:', skill);
        setSkills(prevSkills => {
            const updatedSkills = [...prevSkills, skill];
            console.log('Skills updated:', updatedSkills);
            return updatedSkills;
        });
    };

    const clearSkills = () => setSkills([]);;

  const value: SkillsContextType = { skills, addSkill, clearSkills };

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