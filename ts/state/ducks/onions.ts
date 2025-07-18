import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type OnionState = {
  // Array of Tor-like paths where each path is an array of relay nodes
  snodePaths: Array<Array<{ ip: string }>>; 
  isOnline: boolean;
};

export const initialOnionPathState = {
  snodePaths: new Array<Array<{ ip: string }>>(), // Stores current relay paths
  isOnline: false, // Network connectivity state
};

/**
 * This slice is the one holding our current onion path state, and if we are detected as online.
 */
const onionSlice = createSlice({
  name: 'onionPaths',
  initialState: initialOnionPathState,
  reducers: {
    updateOnionPaths(state: OnionState, action: PayloadAction<Array<Array<{ ip: string }>>>) {
      state.snodePaths = action.payload;
      return state;
    },
    updateIsOnline(state: OnionState, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
      return state;
    },
  },
});

const { actions, reducer } = onionSlice;
export const { updateOnionPaths, updateIsOnline } = actions;
export const defaultOnionReducer = reducer;
