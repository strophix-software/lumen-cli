{{importBlock}}
{{typesBlock}}
{{basePathBlock}}
export const {{nameCamel}}Service = {
  /**
   * Fetch list of {{name}} resources.
   */
  async get({{getParamDef}}){{getReturnType}} {
{{getMethodBody}}
  },

  /**
   * Fetch a single {{name}} by ID.
   */
  async getById(id: string): Promise<{{Name}}> {
{{getByIdMethodBody}}
  },

  /**
   * Create a new {{name}}.
   */
  async create(data: Create{{Name}}Input): Promise<{{Name}}> {
{{createMethodBody}}
  },

  /**
   * Update an existing {{name}}.
   */
  async update(id: string, data: Update{{Name}}Input): Promise<{{Name}}> {
{{updateMethodBody}}
  },

  /**
   * Delete a {{name}} by ID.
   */
  async delete(id: string): Promise<void> {
{{deleteMethodBody}}
  },
};
