import React from 'react';

type PositionFinderProps = {};

const PositionFinder: React.FC<PositionFinderProps> = ({}) => {
  return (
    <>
      <div className="inline-flex items-center justify-center rounded-full bg-gray-200 p-2">
        <a href="#">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            className="h-6 w-6 text-gray-800"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 13v5a2 2 0 01-2 2H9a2 2 0 01-2-2v-5m6-6V4m0 0L9 7l4 3V4m0 0l4-3-4 3z"
            />
          </svg>
        </a>
      </div>
    </>
  );
};

export default PositionFinder;
