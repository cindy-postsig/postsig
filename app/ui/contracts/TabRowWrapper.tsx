import React from 'react';

type TabRowWrapperProps = {
  title: string;
  components?: React.ReactNode[];
  cellWidth: number;
};

const TabRowWrapper: React.FC<TabRowWrapperProps> = ({
  title,
  components,
  cellWidth,
}) => {
  if (!components) return null;

  return (
    <div className={`grid grid-cols-${cellWidth} my-4 gap-4`}>
      {components.map((component, index) => (
        <div key={index}>{component}</div>
      ))}
    </div>
  );
};

export default TabRowWrapper;
