import { PayloadAction, createSlice } from '@reduxjs/toolkit';
import { ThemeStateType } from '../../../themes/constants/colors';

// TODO Move primary color into this slice
export const initialThemeState: ThemeStateType = 'classic-dark' as ThemeStateType;

const themeSlice = createSlice({
  name: 'theme',
  initialState: initialThemeState,
  reducers: {
    updateTheme(_, action: PayloadAction<ThemeStateType>) {
      return action.payload;
    },
  },
});

export const { updateTheme } = themeSlice.actions;
export default themeSlice.reducer;
