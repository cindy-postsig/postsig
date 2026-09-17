import { formatCurrency } from '@/app/lib/utils';

interface ChangeDisplayProps {
  currentValue: number;
  newValue: number;
  /** Display currency for the delta amount; defaults to USD. */
  currency?: string;
  isDarkBackground?: boolean;
  decimalPlaces?: number;
  className?: string;
  size?: 'sm' | 'md';
  showAmount?: boolean;
  showArrow?: boolean;
  inline?: boolean;
}

export const ChangeDisplay: React.FC<ChangeDisplayProps> = ({
  currentValue,
  newValue,
  currency,
  isDarkBackground = false,
  decimalPlaces = 1,
  className = '',
  size = 'sm',
  showAmount = true,
  showArrow = false,
  inline = true,
}) => {
  // Skip rendering if values are the same or base is zero
  if (currentValue === newValue || currentValue === 0) return null;

  const amount = Math.round(newValue - currentValue);
  const rawPercentage =
    ((newValue - currentValue) / Math.abs(currentValue)) * 100;

  // Format percentage with appropriate precision for very small values
  let percentage: number;
  let displayPercentage: string;

  if (Math.abs(rawPercentage) < 0.01) {
    // For very small percentages (< 0.01%), show with 3 decimal places
    percentage = Math.round(rawPercentage * 1000) / 1000;
    displayPercentage = Math.abs(percentage).toFixed(3);
  } else if (Math.abs(rawPercentage) < 0.1) {
    // For small percentages (< 0.1%), show with 2 decimal places
    percentage = Math.round(rawPercentage * 100) / 100;
    displayPercentage = Math.abs(percentage).toFixed(2);
  } else {
    // For normal percentages, use the specified decimal places
    const multiplier = Math.pow(10, decimalPlaces);
    percentage = Math.round(rawPercentage * multiplier) / multiplier;
    displayPercentage = Math.abs(percentage).toFixed(decimalPlaces);
  }

  // Determine if it's an increase or decrease
  const isIncrease = newValue > currentValue;
  const sign = isIncrease ? '+' : '-';

  // Colors based on background and direction
  const getPercentColor = () => {
    // For dark backgrounds
    if (isDarkBackground) {
      return isIncrease ? 'text-[#ff8db0]' : 'text-[#8dff9d]';
    }
    // For light backgrounds
    return isIncrease
      ? 'text-pink-600 dark:text-[#ff8db0]'
      : 'text-green dark:text-[#8dff9d]';
  };

  // Secondary text color based on background
  const getAmountColor = () => {
    return isDarkBackground
      ? 'text-white/60'
      : 'text-gray-700/80 dark:text-white/60';
  };

  const percentColor = getPercentColor();
  const amountColor = getAmountColor();

  return (
    <div
      className={`${inline ? 'inline-flex' : 'flex'} items-center font-sans ${className} ${!isDarkBackground && 'font-normal'} ${size === 'sm' ? 'mt-[2px] text-xs' : 'text-xs 2xl:text-sm'}`}
    >
      {showArrow && (
        <span className={`mr-1 ${percentColor}`}>{isIncrease ? '↑' : '↓'}</span>
      )}
      {percentage !== 0 && (
        <span
          className={`whitespace-nowrap ${inline ? '' : ''} ${percentColor}`}
        >
          {!showArrow && sign}
          {displayPercentage}%
        </span>
      )}
      {showAmount && amount !== 0 && (
        <span className={`whitespace-nowrap pl-2 ${amountColor}`}>
          {!showArrow && sign}
          {formatCurrency(Math.abs(amount), currency)}
        </span>
      )}
    </div>
  );
};
