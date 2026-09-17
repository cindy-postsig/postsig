import { useState, useEffect } from 'react';
import { Input } from '../ui/input';
import { useSecretInputRef } from '@/hooks/useSecretInputRef';
import { passwordSchema, passwordRequirements } from '@/app/lib/validations';
import {
  CheckCircledIcon,
  CheckIcon,
  Cross2Icon,
  EyeNoneIcon,
  EyeOpenIcon,
} from '@radix-ui/react-icons';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValidationChange?: (isValid: boolean) => void;
  required?: boolean;
  className?: string;
  showValidation?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const RequirementIcon = ({ met }: { met: boolean }) => {
  if (met) {
    return <CheckCircledIcon className="h-4 w-4 text-[#00a86b]" />;
  }
  return <Cross2Icon className="h-4 w-4 text-gray-700/80" />;
};

const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  value,
  onChange,
  onValidationChange,
  required,
  className = '',
  showValidation = false,
  disabled = false,
  placeholder,
  autoFocus,
}) => {
  const [visible, setVisible] = useState(false);
  const [requirements, setRequirements] = useState<Record<string, boolean>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const inputRef = useSecretInputRef(value);

  useEffect(() => {
    if (!showValidation) {
      setIsValid(true);
      onValidationChange?.(true);
      return;
    }

    // Check each requirement individually
    const newRequirements = passwordRequirements.reduce(
      (acc, req) => ({
        ...acc,
        [req.id]: req.validator(value),
      }),
      {},
    );
    setRequirements(newRequirements);

    // Validate using Zod schema
    const result = passwordSchema.safeParse(value);
    setIsValid(result.success);
    setValidationError(
      result.success ? null : result.error.issues[0]?.message || null,
    );

    // Notify parent component of validation state
    onValidationChange?.(result.success);
  }, [value, onValidationChange, showValidation]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          id={id}
          ref={inputRef}
          onChange={onChange}
          className={`${className} ${
            showValidation && value && !isValid
              ? 'border-pink-600 border-opacity-100'
              : ''
          } ${showValidation && value && isValid ? 'border-[#00a86b] border-opacity-100' : ''}`}
          required={required}
          name="password"
          autoComplete={!showValidation ? 'current-password' : 'new-password'}
          disabled={disabled}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="absolute right-3 top-1/2 -translate-y-1/2 focus:outline-none"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? (
              <EyeNoneIcon className="h-5 w-5" />
            ) : (
              <EyeOpenIcon className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
      {showValidation && showValidation && value && (
        <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-3 font-label text-sm">
          {passwordRequirements.map((req) => (
            <div key={req.id} className="flex items-center gap-2">
              <RequirementIcon met={requirements[req.id]} />
              <span
                className={
                  requirements[req.id] ? 'text-[#00a86b]' : 'text-gray-700'
                }
              >
                {req.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default PasswordInput;
