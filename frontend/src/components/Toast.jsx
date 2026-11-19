import { motion } from 'framer-motion';
import { Icon } from './ui';

const ICON = { success: 'check', error: 'alert', info: 'info' };

export default function Toast({ message, type = 'info', onClose }) {
    return (
        <motion.div
            className={`toast toast-${type}`}
            role={type === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
        >
            <Icon name={ICON[type] || 'info'} size={16} className="toast-ico" />
            <span style={{ flex: 1, lineHeight: 1.45 }}>{message}</span>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Dismiss">
                <Icon name="x" size={14} />
            </button>
        </motion.div>
    );
}
