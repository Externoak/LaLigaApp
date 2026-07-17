import { formatNumberWithDots } from './helpers';

/**
 * createMoneyInputHandler — cursor-position-preserving change handler for
 * money inputs whose displayed value is re-formatted with thousands dots
 * (formatNumberWithDots) on every keystroke.
 *
 * Stores only digits via `setValue`; after React re-renders the formatted
 * value, it restores the caret next to the same digit the user was editing,
 * so typing in the middle of "10.400.000" doesn't jump the cursor to the end.
 */
export const createMoneyInputHandler = (setValue) => (e) => {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    const rawValue = e.target.value;
    const beforeProcessing = cursorPosition;

    if (rawValue === '') {
        setValue('');
        return;
    }

    const digitsOnly = rawValue.replace(/\D/g, '');
    if (!digitsOnly) {
        // El usuario dejó el campo sin dígitos (p. ej. seleccionó todo y escribió
        // "-"). Hay que sincronizar el estado a '': si volviéramos sin llamar a
        // setValue, el input controlado mostraría el carácter tecleado mientras el
        // estado conserva el número anterior, y ambos quedarían desincronizados.
        setValue('');
        return;
    }

    setValue(digitsOnly);

    setTimeout(() => {
        if (input) {
            const formattedValue = formatNumberWithDots(digitsOnly);
            let digitsBeforeCursor = 0;
            for (let i = 0; i < beforeProcessing && i < rawValue.length; i++) {
                if (/\d/.test(rawValue[i])) digitsBeforeCursor++;
            }
            let newCursorPos = 0;
            let digitCount = 0;
            for (let i = 0; i < formattedValue.length; i++) {
                if (/\d/.test(formattedValue[i])) {
                    digitCount++;
                    if (digitCount === digitsBeforeCursor) {
                        newCursorPos = i + 1;
                        break;
                    }
                }
            }
            newCursorPos = Math.min(newCursorPos, formattedValue.length);
            input.setSelectionRange(newCursorPos, newCursorPos);
        }
    }, 0);
};

export default createMoneyInputHandler;
