// Spanish (es-AR voseo) render of the delete-account confirmation: the Option B copy, verbatim from
// docs/delete-account-contributions-options.md, and nothing left in English.

import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("react-i18next", () => require("@/i18n/testMock").makeReactI18nextMock("es"));

import DeleteAccountModal from "./DeleteAccountModal";

const noop = () => {};

it("member: ES body, switch label and the off hint", () => {
  const { getByText, getByTestId } = render(
    <DeleteAccountModal visible isMember sharedDogNames={[]} onCancel={noop} onConfirm={noop} />,
  );
  expect(getByText("¿Eliminar cuenta?")).toBeTruthy();
  expect(getByText("Esto elimina para siempre tu cuenta, tus perros y sus registros. No se puede deshacer.")).toBeTruthy();
  expect(getByText("Borrar también mis publicaciones sobre perros compartidos conmigo")).toBeTruthy();
  expect(
    getByText('Quedan como "Ex integrante". Los registros de cuidado y las notas veterinarias siempre quedan con el perro.'),
  ).toBeTruthy();
  expect(getByText("Eliminar cuenta")).toBeTruthy();
  expect(getByTestId("delete-contributions-switch").props.value).toBe(false);
});

it("owner of one shared dog: ES owner sentence with the name; of several: the names", () => {
  const one = render(<DeleteAccountModal visible sharedDogNames={["Rex"]} onCancel={noop} onConfirm={noop} />);
  expect(one.getByTestId("delete-account-owner-sentence").props.children).toBe(
    "Rex está compartido con otras personas. Al eliminar tu cuenta, Rex también se borra para ellas, con todo lo que agregaron.",
  );
  const many = render(<DeleteAccountModal visible sharedDogNames={["Rex", "Luna"]} onCancel={noop} onConfirm={noop} />);
  expect(many.getByTestId("delete-account-owner-sentence").props.children).toContain("Rex y Luna están compartidos con otras personas.");
});

it("no member, no owner: neither the switch nor the owner sentence", () => {
  const { queryByTestId } = render(<DeleteAccountModal visible onCancel={noop} onConfirm={noop} />);
  expect(queryByTestId("delete-contributions-switch")).toBeNull();
  expect(queryByTestId("delete-account-owner-sentence")).toBeNull();
});
