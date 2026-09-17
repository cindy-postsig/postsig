import React from 'react';

const TableCell = ({
  children,
  onClick,
  customCss,
  isExpandedRow,
}: {
  children?: React.ReactNode;
  onClick?: any;
  customCss?: string;
  isExpandedRow?: boolean;
}) => {
  return (
    <td
      className={`${customCss} border-b px-2 py-3 text-[.95rem] leading-tight first-of-type:pl-3 last-of-type:pr-3 first-of-type:2xl:text-base ${
        isExpandedRow
          ? 'border-b-background'
          : 'border-b-gray border-opacity-[.12]'
      }`}
      onClick={onClick}
    >
      {children}
    </td>
  );
};

export default TableCell;
