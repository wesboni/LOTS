
export interface UserRole {
    role: 'Admin' | 'Manager' | 'Employee';
    canSwitchView: boolean;
    manages: string[]; // List of names, or '*' for all
}

export const USER_ROLES: Record<string, UserRole> = {
    'Weslley': {
        role: 'Admin',
        canSwitchView: true,
        manages: ['*']
    },
    'Elizabell': {
        role: 'Manager',
        canSwitchView: true,
        manages: ['Elizabell', 'Andre', 'Luke']
    },
    'Kenny': {
        role: 'Manager',
        canSwitchView: true,
        manages: ['Kenny', 'Karl', 'Cristian', 'Lawrence']
    }
};

export const getUserConfig = (username: string): UserRole => {
    // Case-insensitive match for robustness
    const foundKey = Object.keys(USER_ROLES).find(k => k.toLowerCase() === username.toLowerCase());
    if (foundKey) {
        return USER_ROLES[foundKey];
    }
    // Default for everyone else
    return {
        role: 'Employee',
        canSwitchView: false,
        manages: []
    };
};
