import React from 'react';

type Label1Props = {
  title: string;
  text: string | React.ReactNode;
  on: boolean;
};

const Label1: React.FC<Label1Props> = ({ title, text, on }) => {
  return (
    <>
      <div className={`mb-4 px-6 ${!on ? 'opacity-20' : 'opacity-100'}`}>
        <h2 className="font-bold mb-1 font-label text-xs uppercase tracking-wide">
          {title}
        </h2>
        <div className="font-serif text-lg leading-tight tracking-tight">
          {text}
        </div>
      </div>
    </>
  );
};

export default Label1;
