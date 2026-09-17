'use client';

import { EyeIcon } from '@heroicons/react/24/outline';
import { useState, useEffect, useRef } from 'react';

interface PasswordToggleProps {
  inputId: string;
}

const PasswordToggle: React.FC<PasswordToggleProps> = ({ inputId }) => {
  const [visible, setVisible] = useState(false);
  const [inputHasValue, setInputHasValue] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    inputRef.current = input;

    const checkInputValue = () => {
      if (input) {
        setInputHasValue(input.value !== '');
      }
    };

    if (input) {
      checkInputValue();
      input.addEventListener('input', checkInputValue);
    }

    return () => {
      if (input) {
        input.removeEventListener('input', checkInputValue);
      }
    };
  }, [inputId]);

  const togglePasswordVisibility = () => {
    if (inputRef.current) {
      inputRef.current.type = visible ? 'password' : 'text';
      setVisible(!visible);
    }
  };

  return (
    <EyeIcon
      className={`absolute right-3 top-[50%] h-6 w-6 translate-y-[-12px] cursor-pointer text-foreground transition-opacity duration-700 ease-in-out ${
        inputHasValue ? 'z-10 opacity-100' : '-z-10 opacity-0'
      }`}
      onClick={togglePasswordVisibility}
      width={24}
      height={24}
    />
  );
};

export default PasswordToggle;
